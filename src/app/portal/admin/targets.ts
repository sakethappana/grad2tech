import { prisma } from "@/lib/db";

/** Options for "assign to batches / students" pickers. */
export async function targetOptions() {
  const [batches, students] = await Promise.all([
    prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.user.findMany({
      where: { role: "STUDENT", suspendedAt: null, enrolments: { some: { status: "ACTIVE" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  return {
    batches: batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
    students: students.map((s) => ({ value: s.id, label: `${s.name} — ${s.email}` })),
  };
}

export function targetSummary(targets: { batch?: { code: string } | null; student?: { name: string } | null }[]) {
  const batches = targets.map((t) => t.batch?.code).filter(Boolean);
  const students = targets.map((t) => t.student?.name).filter(Boolean);
  const parts = [];
  if (batches.length) parts.push(batches.join(", "));
  if (students.length) parts.push(`${students.length} student${students.length === 1 ? "" : "s"}`);
  return parts.join(" + ") || "No one yet";
}
