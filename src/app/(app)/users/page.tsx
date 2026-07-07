import { ResourcePage } from "@/components/resource-page";

export default function UsersPage() {
  return (
    <ResourcePage
      title="Users"
      description="Team accounts, role assignments, and clinic access control for the operation."
      endpoint="/users"
      preferredKeys={["id", "name", "email", "title", "phone_number", "is_active", "role_id"]}
    />
  );
}
