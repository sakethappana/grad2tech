import { Card, PageHead } from "@/components/ui";
import { pageAdmin } from "@/server/session";
import { targetOptions } from "../../targets";
import { AssignmentForm } from "../assignment-form";

export const metadata = { title: "New assignment" };

export default async function NewAssignment() {
  await pageAdmin("/portal/admin/assignments/new");
  const options = await targetOptions();
  return (
    <>
      <PageHead eyebrow="Assignments" title="New assignment" description="Saved as a draft first. Students only see it once you publish." />
      <Card>
        <AssignmentForm options={options} />
      </Card>
    </>
  );
}
