import { PerformanceReport } from "@/components/performance";
import { PageHead } from "@/components/ui";
import { studentReport } from "@/server/reports";
import { pageStudent } from "@/server/session";

export const metadata = { title: "Performance" };

export default async function StudentPerformance() {
  const me = await pageStudent("/portal/student/performance");
  const report = await studentReport(me.id, "student");
  return (
    <>
      <PageHead
        title="Performance"
        description="Calculated from your submitted work, released test results and recorded attendance. Each figure shows what it is out of."
      />
      <PerformanceReport report={report} viewer="student" />
    </>
  );
}
