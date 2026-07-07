import { ResourcePage } from "@/components/resource-page";

export default function WarehousesPage() {
  return (
    <ResourcePage
      title="Warehouses"
      description="Warehouse records tied to clinics for stock reservation and inventory deduction."
      endpoint="/warehouses"
      preferredKeys={["id", "clinic_id", "name", "created_at"]}
    />
  );
}
