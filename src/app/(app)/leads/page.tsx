import { ResourcePage } from "@/components/resource-page";

export default function LeadsPage() {
  return (
    <ResourcePage
      title="Leads"
      description="Track incoming opportunities, qualification, ownership, and CRM momentum."
      endpoint="/leads"
      preferredKeys={["id", "name", "phone", "platform", "lead_status_id", "campaign_id", "created_at"]}
    />
  );
}
