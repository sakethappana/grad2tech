import { Card, PageHead } from "@/components/ui";
import { pageAdmin } from "@/server/session";
import { targetOptions } from "../../targets";
import { BriefForm } from "../brief-form";

export const metadata = { title: "New project brief" };

export default async function NewBrief() {
  await pageAdmin("/portal/admin/projects/new");
  return (
    <>
      <PageHead eyebrow="Projects" title="New project brief" description="Students start from the chosen starter and submit fixed versions for review." />
      <Card>
        <BriefForm options={await targetOptions()} />
      </Card>
    </>
  );
}
