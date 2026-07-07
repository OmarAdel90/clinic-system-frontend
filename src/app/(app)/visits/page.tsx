import { ResourcePage } from "@/components/resource-page";

export default function VisitsPage() {
  return (
    <ResourcePage
      title="Visits"
      description="Monitor scheduled care, status transitions, clinic assignment, and financial totals."
      endpoint="/visits"
      preferredKeys={["id", "lead_id", "clinic_id", "scheduled_date", "status", "services_cost", "supplies_cost", "total_cost"]}
    />
  );
}
