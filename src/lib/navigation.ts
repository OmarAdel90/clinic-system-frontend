import type { NavItem } from "@/lib/types";

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", description: "Operational overview" },
  { label: "Leads", href: "/leads", description: "CRM pipeline and assignments" },
  { label: "Visits", href: "/visits", description: "Scheduling and visit lifecycle" },
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
    roles: ["admin"],
  },
  {
    label: "Roles",
    href: "/roles",
    description: "Permissions and RBAC",
    roles: ["admin"],
  },
];
