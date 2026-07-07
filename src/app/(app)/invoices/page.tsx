import { ResourcePage } from "@/components/resource-page";

export default function InvoicesPage() {
  return (
    <ResourcePage
      title="Invoices"
      description="Follow billing status, payment progress, and treatment-related charges."
      endpoint="/invoices"
      preferredKeys={["id", "invoice_number", "lead_id", "clinic_id", "total_cost", "amount_paid", "status", "issued_at"]}
    />
  );
}
