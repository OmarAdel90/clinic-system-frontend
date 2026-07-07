import { ResourcePage } from "@/components/resource-page";

export default function PharmaceuticalsPage() {
  return (
    <ResourcePage
      title="Pharmaceuticals"
      description="Medication catalog keyed by SKU for reservation, warehouse transactions, and visit supply usage."
      endpoint="/pharmaceuticals"
      preferredKeys={["SKU", "name", "arabic_name", "sale_price", "description"]}
    />
  );
}
