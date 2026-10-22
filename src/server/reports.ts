import { prisma } from "@/lib/db";
import { resultsVisible } from "@/server/assessments/lifecycle";

/**
 * Performance metrics computed from records. Definitions (shown in the UI):
 * - Assignments counted: published, not cancelled, assigned to the student (directly, or to a batch
 *   they belonged to at the due date), with a due date in the past. Future deadlines are excluded.
 * - On time: first submission at or before the due date. Late: submitted after it. Missing: never submitted.
 * - Awaiting review: submitted but not yet marked (not counted as missing or failed).
 * - Test %: score / maximum for fully graded attempts. Failed: below the test's pass mark (if set).
 * - Attendance rate: (present + late) / sessions with attendance recorded for the student, excluding excused.
 */

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export type Viewer = "admin" | "student";

type Enrol = { batchId: string; startDate: Date; endDate: Date | null };

function enrolledAt(enrolments: Enrol[], batchId: string, at: Date) {
  return enrolments.some((e) => e.batchId === batchId && e.startDate <= at && (!e.endDate || e.endDate >= at));
}

export async function studentAssignmentMetrics(studentId: string, now = new Date()) {
  const enrolments = await prisma.enrolment.findMany({ where: { studentId }, select: { batchId: true, startDate: true, endDate: true } });
  const batchIds = [...new Set(enrolments.map((e) => e.batchId))];
  const assignments = await prisma.assignment.findMany({
    where: {
      status: "PUBLISHED",
      publishAt: { not: null, lte: now },
      targets: { some: { OR: [{ studentId }, { batchId: { in: batchIds } }] } },
    },
    include: {
      targets: { select: { batchId: true, studentId: true } },
      submissions: { where: { studentId }, include: { history: { orderBy: { revision: "asc" }, take: 1 } } },
    },
    orderBy: { dueAt: "desc" },
  });

  const rows = assignments
    .filter((a) => a.targets.some((t) => t.studentId === studentId || (t.batchId && enrolledAt(enrolments, t.batchId, a.dueAt))))
    .map((a) => {
      const s = a.submissions[0];
      const submitted = s && s.status !== "DRAFT";
      const firstLate = s?.history[0]?.isLate ?? s?.isLate ?? false;
      let state: "UPCOMING" | "ON_TIME" | "LATE" | "MISSING";
      if (a.dueAt > now) state = submitted ? (firstLate ? "LATE" : "ON_TIME") : "UPCOMING";
      else if (!submitted) state = "MISSING";
      else state = firstLate ? "LATE" : "ON_TIME";
      return {
        id: a.id,
        title: a.title,
        topic: a.topic,
        dueAt: a.dueAt,
        maxMarks: a.maxMarks,
        state,
        reviewState: !submitted ? null : s.status === "REVIEWED" ? "REVIEWED" : s.status === "RESUBMIT_REQUESTED" ? "RESUBMIT_REQUESTED" : "AWAITING_REVIEW",
        marks: s?.status === "REVIEWED" ? s.marks : null,
        submittedAt: s?.submittedAt ?? null,
      };
    });

  const due = rows.filter((r) => r.dueAt <= now);
  const reviewed = rows.filter((r) => r.reviewState === "REVIEWED" && r.marks !== null);
  const marksPct = reviewed.length
    ? pct(reviewed.reduce((s, r) => s + (r.marks ?? 0), 0), reviewed.reduce((s, r) => s + r.maxMarks, 0))
    : null;
  return {
    rows,
    summary: {
      due: due.length,
      onTime: due.filter((r) => r.state === "ON_TIME").length,
      late: due.filter((r) => r.state === "LATE").length,
      missing: due.filter((r) => r.state === "MISSING").length,
      awaitingReview: rows.filter((r) => r.reviewState === "AWAITING_REVIEW").length,
      reviewed: reviewed.length,
      onTimeRate: pct(due.filter((r) => r.state === "ON_TIME").length, due.length),
      marksPct,
    },
  };
}

export async function studentTestMetrics(studentId: string, viewer: Viewer, now = new Date()) {
  const attempts = await prisma.attempt.findMany({
    where: { studentId, status: { not: "IN_PROGRESS" }, assessment: { status: { not: "CANCELLED" } } },
    include: {
      assessment: { select: { id: true, title: true, kind: true, passPercent: true, resultPolicy: true, resultsReleasedAt: true, closesAt: true } },
      answers: { select: { gradeStatus: true, marksAwarded: true, question: { select: { type: true, topic: true, marks: true } } } },
    },
    orderBy: { submittedAt: "asc" },
  });

  const rows = attempts.map((at) => {
    const visible = viewer === "admin" || resultsVisible(at.assessment, at, now);
    const executionError = at.answers.some((a) => a.gradeStatus === "EXECUTION_ERROR");
    const graded = at.gradingStatus === "GRADED";
    const percent = graded && visible ? pct(at.score ?? 0, at.maxScore) : null;
    const failed = percent !== null && at.assessment.passPercent !== null ? percent < at.assessment.passPercent : null;
    let status: "AWAITING_GRADING" | "PARTIALLY_GRADED" | "EXECUTION_ERROR" | "PASSED" | "FAILED" | "GRADED" | "NOT_RELEASED";
    if (executionError) status = "EXECUTION_ERROR";
    else if (at.gradingStatus === "AWAITING_GRADING") status = "AWAITING_GRADING";
    else if (at.gradingStatus === "PARTIALLY_GRADED") status = "PARTIALLY_GRADED";
    else if (!visible) status = "NOT_RELEASED";
    else status = failed === null ? "GRADED" : failed ? "FAILED" : "PASSED";
    return {
      attemptId: at.id,
      assessmentId: at.assessment.id,
      title: at.assessment.title,
      kind: at.assessment.kind,
      number: at.number,
      submittedAt: at.submittedAt,
      score: visible && graded ? at.score : null,
      maxScore: at.maxScore,
      percent,
      passPercent: at.assessment.passPercent,
      status,
      visible,
      answers: visible && graded ? at.answers : [],
    };
  });

  const graded = rows.filter((r) => r.percent !== null);
  return {
    rows,
    series: graded.map((r) => ({ label: r.title, date: r.submittedAt, percent: r.percent as number, kind: r.kind })),
    summary: {
      gradedCount: graded.length,
      averagePercent: graded.length ? Math.round((graded.reduce((s, r) => s + (r.percent ?? 0), 0) / graded.length) * 10) / 10 : null,
      failed: rows.filter((r) => r.status === "FAILED").length,
      awaiting: rows.filter((r) => r.status === "AWAITING_GRADING" || r.status === "PARTIALLY_GRADED").length,
      executionErrors: rows.filter((r) => r.status === "EXECUTION_ERROR").length,
    },
  };
}

type TopicAgg = { topic: string; earned: number; possible: number; items: number };

export function topicBreakdown(
  tests: Awaited<ReturnType<typeof studentTestMetrics>>,
  assignments: Awaited<ReturnType<typeof studentAssignmentMetrics>>,
) {
  const map = new Map<string, TopicAgg>();
  const add = (topic: string, earned: number, possible: number) => {
    const key = topic.trim() || "General";
    const cur = map.get(key) ?? { topic: key, earned: 0, possible: 0, items: 0 };
    cur.earned += earned;
    cur.possible += possible;
    cur.items += 1;
    map.set(key, cur);
  };
  for (const r of tests.rows) for (const a of r.answers) add(a.question.topic, a.marksAwarded ?? 0, a.question.marks);
  for (const r of assignments.rows) if (r.marks !== null) add(r.topic, r.marks, r.maxMarks);
  return [...map.values()]
    .map((t) => ({ ...t, earned: Math.round(t.earned * 100) / 100, percent: pct(t.earned, t.possible) }))
    .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));
}

export async function codingOutcomes(studentId: string, viewer: Viewer, now = new Date()) {
  const answers = await prisma.attemptAnswer.findMany({
    where: { question: { type: "CODING" }, attempt: { studentId, status: { not: "IN_PROGRESS" }, assessment: { status: { not: "CANCELLED" } } } },
    select: {
      gradeStatus: true,
      marksAwarded: true,
      question: { select: { marks: true } },
      attempt: { select: { status: true, gradingStatus: true, assessment: { select: { resultPolicy: true, resultsReleasedAt: true, closesAt: true } } } },
    },
  });
  const out = { fullyPassed: 0, partiallyPassed: 0, notPassed: 0, executionError: 0, awaitingGrading: 0, unanswered: 0, notReleased: 0 };
  for (const a of answers) {
    if (a.gradeStatus === "EXECUTION_ERROR") out.executionError++;
    else if (a.gradeStatus === "PENDING") out.awaitingGrading++;
    else if (a.gradeStatus === "UNANSWERED") out.unanswered++;
    else if (viewer === "student" && !resultsVisible(a.attempt.assessment, a.attempt, now)) out.notReleased++;
    else if ((a.marksAwarded ?? 0) >= a.question.marks) out.fullyPassed++;
    else if ((a.marksAwarded ?? 0) > 0) out.partiallyPassed++;
    else out.notPassed++;
  }
  return out;
}

export async function attendanceMetrics(studentId: string, now = new Date()) {
  const enrolments = await prisma.enrolment.findMany({ where: { studentId }, select: { batchId: true, startDate: true, endDate: true } });
  const sessions = await prisma.classSession.findMany({
    where: { batchId: { in: [...new Set(enrolments.map((e) => e.batchId))] }, cancelledAt: null, startsAt: { lte: now }, attendance: { some: {} } },
    include: { attendance: { where: { studentId } } },
    orderBy: { startsAt: "desc" },
  });
  const relevant = sessions.filter((s) => enrolledAt(enrolments, s.batchId, s.startsAt));
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, NOT_RECORDED: 0 };
  const rows = relevant.map((s) => {
    const status = s.attendance[0]?.status ?? "NOT_RECORDED";
    counts[status]++;
    return { id: s.id, topic: s.topic, startsAt: s.startsAt, status };
  });
  const denominator = counts.PRESENT + counts.LATE + counts.ABSENT;
  return { rows, counts, denominator, rate: pct(counts.PRESENT + counts.LATE, denominator) };
}

export async function studentReport(studentId: string, viewer: Viewer, now = new Date()) {
  const [assignments, tests, coding, attendance, projects, feedback] = await Promise.all([
    studentAssignmentMetrics(studentId, now),
    studentTestMetrics(studentId, viewer, now),
    codingOutcomes(studentId, viewer, now),
    attendanceMetrics(studentId, now),
    prisma.projectSubmission.findMany({
      where: { studentId },
      orderBy: { submittedAt: "desc" },
      select: { id: true, status: true, marks: true, feedback: true, submittedAt: true, reviewedAt: true, project: { select: { name: true } }, brief: { select: { title: true, maxMarks: true } } },
    }),
    prisma.trainerFeedback.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } }),
  ]);
  return { assignments, tests, topics: topicBreakdown(tests, assignments), coding, attendance, projects, feedback };
}

// ── Admin overview ─────────────────────────────────────────────

export async function adminOverview(now = new Date()) {
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const ago14 = new Date(now.getTime() - 14 * 86_400_000);
  const ago30 = new Date(now.getTime() - 30 * 86_400_000);

  const [
    activeStudents,
    activeBatches,
    assignmentsDue,
    awaitingReview,
    testsScheduled,
    testsOpen,
    testsClosed,
    openDoubts,
    unansweredDoubts,
    answeredRecently,
    writtenToGrade,
    gradingErrors,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT", suspendedAt: null, enrolments: { some: { status: "ACTIVE" } } } }),
    prisma.batch.count({ where: { archivedAt: null } }),
    prisma.assignment.count({ where: { status: "PUBLISHED", dueAt: { gte: now, lte: in7 } } }),
    prisma.submission.count({ where: { status: "SUBMITTED", assignment: { status: { not: "CANCELLED" } } } }),
    prisma.assessment.count({ where: { status: "PUBLISHED", OR: [{ publishAt: { gt: now } }, { opensAt: { gt: now } }] } }),
    prisma.assessment.count({ where: { status: "PUBLISHED", publishAt: { lte: now }, opensAt: { lte: now }, closesAt: { gt: now } } }),
    prisma.assessment.count({ where: { status: "PUBLISHED", closesAt: { lte: now, gte: ago30 } } }),
    prisma.doubtThread.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.doubtThread.count({ where: { status: { not: "RESOLVED" }, firstResponseAt: null } }),
    prisma.doubtThread.findMany({ where: { firstResponseAt: { not: null }, createdAt: { gte: ago30 } }, select: { createdAt: true, firstResponseAt: true } }),
    prisma.attemptAnswer.count({ where: { gradeStatus: "NEEDS_REVIEW" } }),
    prisma.attemptAnswer.count({ where: { gradeStatus: "EXECUTION_ERROR" } }),
  ]);

  const responseHours = answeredRecently.length
    ? Math.round(
        (answeredRecently.reduce((s, d) => s + (d.firstResponseAt!.getTime() - d.createdAt.getTime()), 0) / answeredRecently.length / 3_600_000) * 10,
      ) / 10
    : null;

  // Missed work: assignments due in the last 14 days with no submission.
  const recentDue = await prisma.assignment.findMany({
    where: { status: "PUBLISHED", dueAt: { gte: ago14, lte: now } },
    include: { targets: true, submissions: { where: { status: { not: "DRAFT" } }, select: { studentId: true } } },
  });
  const missed = new Map<string, number>();
  if (recentDue.length) {
    const enrolments = await prisma.enrolment.findMany({
      where: { batchId: { in: [...new Set(recentDue.flatMap((a) => a.targets.map((t) => t.batchId).filter(Boolean) as string[]))] }, student: { suspendedAt: null } },
      select: { studentId: true, batchId: true, startDate: true, endDate: true },
    });
    for (const a of recentDue) {
      const submitted = new Set(a.submissions.map((s) => s.studentId));
      const assigned = new Set<string>();
      for (const t of a.targets) {
        if (t.studentId) assigned.add(t.studentId);
        if (t.batchId) for (const e of enrolments) if (e.batchId === t.batchId && e.startDate <= a.dueAt && (!e.endDate || e.endDate >= a.dueAt)) assigned.add(e.studentId);
      }
      for (const sid of assigned) if (!submitted.has(sid)) missed.set(sid, (missed.get(sid) ?? 0) + 1);
    }
  }

  // Declining results: latest graded test percentage at least 10 points below the previous one.
  const graded = await prisma.attempt.findMany({
    where: { gradingStatus: "GRADED", submittedAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } },
    select: { studentId: true, score: true, maxScore: true, submittedAt: true },
    orderBy: { submittedAt: "desc" },
  });
  const lastTwo = new Map<string, number[]>();
  for (const g of graded) {
    const list = lastTwo.get(g.studentId) ?? [];
    if (list.length < 2 && g.maxScore > 0) list.push(((g.score ?? 0) / g.maxScore) * 100);
    lastTwo.set(g.studentId, list);
  }
  const declining = [...lastTwo.entries()]
    .filter(([, l]) => l.length === 2 && l[0] <= l[1] - 10)
    .map(([studentId, l]) => ({ studentId, latest: Math.round(l[0]), previous: Math.round(l[1]) }));

  const flaggedIds = [...new Set([...missed.keys(), ...declining.map((d) => d.studentId)])];
  const flaggedUsers = flaggedIds.length
    ? await prisma.user.findMany({ where: { id: { in: flaggedIds } }, select: { id: true, name: true, email: true } })
    : [];
  const userBy = new Map(flaggedUsers.map((u) => [u.id, u]));

  const [recentSubmissions, recentAttempts, recentProjects, activity] = await Promise.all([
    prisma.submission.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { submittedAt: "desc" },
      take: 8,
      select: { id: true, status: true, submittedAt: true, isLate: true, assignment: { select: { id: true, title: true } }, student: { select: { id: true, name: true } } },
    }),
    prisma.attempt.findMany({
      where: { status: { not: "IN_PROGRESS" } },
      orderBy: { submittedAt: "desc" },
      take: 8,
      select: { id: true, status: true, gradingStatus: true, submittedAt: true, assessment: { select: { id: true, title: true } }, student: { select: { id: true, name: true } } },
    }),
    prisma.projectSubmission.findMany({
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: { id: true, status: true, submittedAt: true, project: { select: { name: true } }, student: { select: { id: true, name: true } } },
    }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true } } } }),
  ]);

  return {
    counts: { activeStudents, activeBatches, assignmentsDue, awaitingReview, testsScheduled, testsOpen, testsClosed, openDoubts, unansweredDoubts, writtenToGrade, gradingErrors },
    responseHours,
    missed: [...missed.entries()]
      .map(([studentId, count]) => ({ student: userBy.get(studentId), count }))
      .filter((m) => m.student)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    declining: declining.map((d) => ({ ...d, student: userBy.get(d.studentId) })).filter((d) => d.student).slice(0, 10),
    recentSubmissions,
    recentAttempts,
    recentProjects,
    activity,
  };
}

// ── CSV export ─────────────────────────────────────────────────

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export async function studentSummaries(batchId: string | null, now = new Date()) {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", ...(batchId ? { enrolments: { some: { batchId } } } : {}) },
    select: { id: true, name: true, email: true, suspendedAt: true, enrolments: { where: { status: "ACTIVE" }, select: { batch: { select: { code: true } } } } },
    orderBy: { name: "asc" },
  });
  const out = [];
  for (const s of students) {
    const [a, t, att, openDoubts] = await Promise.all([
      studentAssignmentMetrics(s.id, now),
      studentTestMetrics(s.id, "admin", now),
      attendanceMetrics(s.id, now),
      prisma.doubtThread.count({ where: { studentId: s.id, status: { not: "RESOLVED" } } }),
    ]);
    out.push({ student: s, assignments: a.summary, tests: t.summary, attendance: { denominator: att.denominator, rate: att.rate }, openDoubts });
  }
  return out;
}

export async function studentSummaryCsv(batchId: string | null, now = new Date()) {
  const rows: (string | number | null)[][] = [
    [
      "Name",
      "Email",
      "Active batches",
      "Portal access",
      "Assignments due (denominator)",
      "On time",
      "Late",
      "Missing",
      "Awaiting review",
      "On-time rate %",
      "Reviewed assignment marks %",
      "Graded tests",
      "Average test %",
      "Tests below pass mark",
      "Tests with runner errors",
      "Attendance denominator",
      "Attendance rate %",
      "Open doubts",
    ],
  ];
  for (const r of await studentSummaries(batchId, now)) {
    rows.push([
      r.student.name,
      r.student.email,
      r.student.enrolments.map((e) => e.batch.code).join(" "),
      r.student.suspendedAt ? "Suspended" : "Active",
      r.assignments.due,
      r.assignments.onTime,
      r.assignments.late,
      r.assignments.missing,
      r.assignments.awaitingReview,
      r.assignments.onTimeRate,
      r.assignments.marksPct,
      r.tests.gradedCount,
      r.tests.averagePercent,
      r.tests.failed,
      r.tests.executionErrors,
      r.attendance.denominator,
      r.attendance.rate,
      r.openDoubts,
    ]);
  }
  return toCsv(rows);
}
