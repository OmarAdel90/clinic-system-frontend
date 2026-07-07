import { ResourcePage } from "@/components/resource-page";

export default function SuppliersPage() {
  return (
    <ResourcePage
      title="Suppliers"
      description="Vendor directory for pharmaceutical purchasing, warehouse intake, and payment tracking."
      endpoint="/suppliers"
      preferredKeys={["id", "name", "phone_number", "created_at"]}
    />
  );
}
