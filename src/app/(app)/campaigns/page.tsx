import { ResourcePage } from "@/components/resource-page";

export default function CampaignsPage() {
  return (
    <ResourcePage
      title="Campaigns"
      description="Marketing campaign setup, budget, platform, and lead acquisition context."
      endpoint="/campaigns"
      preferredKeys={["id", "name", "platform", "budget", "status", "start_date", "end_date"]}
    />
  );
}
