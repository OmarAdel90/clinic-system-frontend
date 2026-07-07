import { ResourcePage } from "@/components/resource-page";

export default function ClinicsPage() {
  return (
    <ResourcePage
      title="Clinics"
      description="Clinic master data, services, medication support, and branch contact details."
      endpoint="/clinics"
      preferredKeys={["id", "name", "arabic_name", "phone_number", "provides_medication", "address"]}
    />
  );
}
