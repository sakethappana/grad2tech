import { ActionForm, FileField, Select, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Card, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { activeBatchIds, isAssessmentOpen, visibleAssessmentWhere, visibleAssignmentWhere, visibleBriefWhere } from "@/server/access";
import { pageStudent } from "@/server/session";
import { createDoubtAction } from "../../../doubt-actions";

export const metadata = { title: "Ask a doubt" };

export default async function NewDoubt(props: PageProps<"/portal/student/doubts/new">) {
  const me = await pageStudent("/portal/student/doubts/new");
  const sp = await props.searchParams;
  const now = new Date();
  const batchIds = await activeBatchIds(me.id);
  const [assignments, tests, briefs] = await Promise.all([
    prisma.assignment.findMany({ where: visibleAssignmentWhere(me.id, batchIds, now), orderBy: { dueAt: "desc" }, take: 30, select: { id: true, title: true } }),
    prisma.assessment.findMany({ where: visibleAssessmentWhere(me.id, batchIds, now), orderBy: { opensAt: "desc" }, take: 20 }),
    prisma.projectBrief.findMany({ where: visibleBriefWhere(me.id, batchIds, now), orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true } }),
  ]);
  // A test's help policy decides whether it can be linked while open.
  const linkableTests = tests.filter((t) => !(isAssessmentOpen(t, now) && t.helpPolicy === "NO_HELP_WHILE_OPEN"));
  const options = [
    ...assignments.map((a) => ({ value: `assignment:${a.id}`, label: `Assignment — ${a.title}` })),
    ...linkableTests.map((t) => ({ value: `test:${t.id}`, label: `Test — ${t.title}${isAssessmentOpen(t, now) ? " (open: private only)" : ""}` })),
    ...briefs.map((b) => ({ value: `project:${b.id}`, label: `Project — ${b.title}` })),
  ];
  const preset = typeof sp.link === "string" && options.some((o) => o.value === sp.link) ? sp.link : "";

  return (
    <>
      <PageHead eyebrow="My Doubts" title="Ask a doubt" description="Describe what you tried and where you're stuck. A trainer will reply in this thread." />
      <Card>
        <ActionForm action={createDoubtAction}>
          <TextField name="title" label="Short title" placeholder="My fetch call returns undefined" required />
          <div className="form__row">
            <TextField name="topic" label="Topic" placeholder="e.g. JavaScript promises" required />
            <Select name="link" label="Related task (optional)" options={options} defaultValue={preset} placeholder="Not linked to a task" />
          </div>
          <TextArea name="body" label="What's the problem?" rows={7} hint="Include what you expected, what happened, and what you already tried. Markdown supported." required />
          <div className="form__row">
            <TextField name="codeLanguage" label="Code language (optional)" placeholder="e.g. JavaScript" />
            <Select
              name="visibility"
              label="Who can see it"
              options={[
                { value: "PRIVATE", label: "Private — only me and trainers" },
                { value: "BATCH", label: "Share with my batch" },
              ]}
              defaultValue="PRIVATE"
              hint="Doubts linked to an open test are always private."
            />
          </div>
          <TextArea name="codeSnippet" label="Code snippet (optional)" rows={8} code />
          <FileField name="screenshots" label="Screenshots (optional)" accept="image/png,image/jpeg,image/webp" hint="PNG, JPG or WebP, up to 10 MB each." />
          <SubmitButton pendingText="Posting…">Post doubt</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
