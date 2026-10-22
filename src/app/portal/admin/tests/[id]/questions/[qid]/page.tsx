import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { availableLanguages } from "@/server/playground";
import { pageAdmin } from "@/server/session";
import { EMPTY_QUESTION, QuestionEditor, type QuestionDraft } from "../../../question-editor";

export const metadata = { title: "Edit question" };

/** Handles both /questions/new and /questions/[qid]. */
export default async function QuestionPage(props: PageProps<"/portal/admin/tests/[id]/questions/[qid]">) {
  const { id, qid } = await props.params;
  await pageAdmin(`/portal/admin/tests/${id}/questions/${qid}`);
  const test = await prisma.assessment.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!test) notFound();
  const version = await prisma.assessmentVersion.findFirst({ where: { assessmentId: id }, orderBy: { number: "desc" } });
  if (!version) notFound();

  let initial: QuestionDraft = EMPTY_QUESTION;
  let questionId: string | null = null;
  if (qid !== "new") {
    const q = await prisma.question.findFirst({ where: { id: qid, versionId: version.id }, include: { cases: { orderBy: { order: "asc" } } } });
    if (!q) notFound();
    questionId = q.id;
    initial = {
      type: q.type,
      topic: q.topic,
      prompt: q.prompt,
      marks: q.marks,
      options: (q.options as QuestionDraft["options"] | null) ?? [],
      correctOptionIds: q.correctOptionIds,
      solution: q.solution,
      inputFormat: q.inputFormat,
      outputFormat: q.outputFormat,
      constraints: q.constraints,
      starterCode: (q.starterCode as Record<string, string> | null) ?? {},
      allowedLanguages: q.allowedLanguages,
      timeLimitMs: q.timeLimitMs,
      memoryLimitKb: q.memoryLimitKb,
      scoring: q.scoring,
      cases: q.cases.map((c) => ({ isSample: c.isSample, input: c.input, expectedOutput: c.expectedOutput, weight: c.weight })),
    };
  }
  const langs = await availableLanguages();

  return (
    <>
      <PageHead
        eyebrow={test.title}
        title={questionId ? "Edit question" : "New question"}
        actions={
          <Link className="btn btn--secondary" href={`/portal/admin/tests/${id}#questions`}>
            Back to test
          </Link>
        }
      />
      {version.lockedAt ? (
        <Alert tone="warn">This version is published and frozen. Create a revision from the test page to change questions.</Alert>
      ) : (
        <Card>
          <QuestionEditor
            assessmentId={id}
            questionId={questionId}
            initial={initial}
            languages={langs.languages.map((l) => ({ key: l.key, name: l.name, family: l.family }))}
            languageError={langs.error}
          />
        </Card>
      )}
    </>
  );
}
