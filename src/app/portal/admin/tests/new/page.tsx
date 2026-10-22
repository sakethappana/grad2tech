import { Card, PageHead } from "@/components/ui";
import { pageAdmin } from "@/server/session";
import { targetOptions } from "../../targets";
import { TestSettingsForm } from "../settings-form";

export const metadata = { title: "New test" };

export default async function NewTest() {
  await pageAdmin("/portal/admin/tests/new");
  return (
    <>
      <PageHead eyebrow="Tests" title="New test" description="Set the schedule and rules first. You'll add questions on the next screen." />
      <Card>
        <TestSettingsForm options={await targetOptions()} />
      </Card>
    </>
  );
}
