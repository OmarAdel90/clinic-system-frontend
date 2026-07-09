import type { NavItem } from "@/lib/types";

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", description: "Operational overview" },
  { label: "Leads", href: "/leads", description: "CRM pipeline and assignments" },
  {
    label: "Lead Queue",
    href: "/lead-queue",
    description: "Round-robin queue management",
    permissions: ["view_any_call_center_queue_entry", "create_call_center_queue_entry", "delete_call_center_queue_entry"],
  },
  { label: "Lead Statuses", href: "/lead-statuses", description: "Dynamic pipeline status management" },
  { label: "Agent", href: "/agent", description: "Follow-ups, conversations, and performance" },
  { label: "Treatment Plans", href: "/treatment-plans", description: "Planned care and visit bundles" },
  { label: "Visits", href: "/visits", description: "Scheduling and visit lifecycle" },
  { label: "Patient Feedback", href: "/patient-feedback", description: "Post-visit patient sentiment and follow-through" },
  { label: "Invoices", href: "/invoices", description: "Billing and payments" },
  { label: "Clinics", href: "/clinics", description: "Branches and services" },
  { label: "Warehouses", href: "/warehouses", description: "Inventory and stock" },
  { label: "Suppliers", href: "/suppliers", description: "Vendors and supplier payments" },
  { label: "Campaigns", href: "/campaigns", description: "Marketing performance" },
  { label: "Pharmaceuticals", href: "/pharmaceuticals", description: "Medication catalog" },
  {
    label: "Users",
    href: "/users",
    description: "Team members and access",
    permissions: ["view_any_user", "create_user", "update_user", "delete_user"],
  },
  {
    label: "Roles",
    href: "/roles",
    description: "Permissions and RBAC",
    permissions: ["view_any_role", "create_role", "update_role", "delete_role"],
  },
];
