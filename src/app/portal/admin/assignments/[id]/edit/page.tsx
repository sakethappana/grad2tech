import { notFound } from "next/navigation";
import { Alert, Card, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { pageAdmin } from "@/server/session";
import { targetOptions } from "../../../targets";
import { AssignmentForm } from "../../assignment-form";

export const metadata = { title: "Edit assignment" };

export default async function EditAssignment(props: PageProps<"/portal/admin/assignments/[id]/edit">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/assignments/${id}/edit`);
  const a = await prisma.assignment.findUnique({ where: { id }, include: { targets: true } });
  if (!a) notFound();
  const options = await targetOptions();
  return (
    <>
      <PageHead eyebrow="Assignments" title={`Edit: ${a.title}`} />
      <div className="stack">
        {a.status === "PUBLISHED" && <Alert tone="info">This assignment is published. Changes (including the due date) apply immediately and are recorded in the audit log.</Alert>}
        <Card>
          <AssignmentForm
            assignment={a}
            options={options}
            targets={{ batchIds: a.targets.map((t) => t.batchId).filter(Boolean) as string[], studentIds: a.targets.map((t) => t.studentId).filter(Boolean) as string[] }}
          />
        </Card>
      </div>
    </>
  );
}
