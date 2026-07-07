import { ResourcePage } from "@/components/resource-page";

export default function RolesPage() {
  return (
    <ResourcePage
      title="Roles"
      description="Permission bundles that drive who can view, create, update, and delete each domain model."
      endpoint="/roles"
      preferredKeys={["id", "name", "guard_name", "created_at"]}
    />
  );
}
