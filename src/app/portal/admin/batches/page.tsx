import Link from "next/link";
import { ActionForm, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dDate } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { createBatchAction } from "../people-actions";

export const metadata = { title: "Batches" };

export default async function BatchesPage(props: PageProps<"/portal/admin/batches">) {
  await pageAdmin("/portal/admin/batches");
  const sp = await props.searchParams;
  const showArchived = sp.archived === "1";
  const batches = await prisma.batch.findMany({
    where: showArchived ? { archivedAt: { not: null } } : { archivedAt: null },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { enrolments: { where: { status: "ACTIVE" } }, classes: true } } },
  });

  return (
    <>
      <PageHead
        title="Batches"
        description="Groups of students who learn together. Archiving a batch hides it from active lists but keeps every enrolment and record."
        actions={
          <Link className="btn btn--secondary" href={showArchived ? "/portal/admin/batches" : "/portal/admin/batches?archived=1"}>
            {showArchived ? "Show active batches" : "Show archived batches"}
          </Link>
        }
      />
      <div className="grid grid--main-side">
        <Card title={showArchived ? "Archived batches" : "Active batches"} flush>
          {batches.length === 0 ? (
            <Empty icon="layers" title={showArchived ? "No archived batches" : "No batches yet"}>
              {showArchived ? "Archived batches will appear here." : "Create the first batch, then invite students into it."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col">Code</th>
                    <th scope="col">Start date</th>
                    <th scope="col" className="num">Active students</th>
                    <th scope="col" className="num">Classes</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/portal/admin/batches/${b.id}`}>{b.name}</Link> {b.archivedAt && <Badge>Archived</Badge>}
                      </td>
                      <td>
                        <code>{b.code}</code>
                      </td>
                      <td>{dDate(b.startDate)}</td>
                      <td className="num">{b._count.enrolments}</td>
                      <td className="num">{b._count.classes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Create a batch">
          <ActionForm action={createBatchAction} resetOnSuccess>
            <TextField name="name" label="Batch name" placeholder="Full Stack — January 2027" required />
            <TextField name="code" label="Short code" placeholder="FS-JAN27" hint="Letters, numbers and dashes. Must be unique." required />
            <TextField name="startDate" label="Start date" type="date" />
            <TextArea name="description" label="Description" rows={3} />
            <SubmitButton>Create batch</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
