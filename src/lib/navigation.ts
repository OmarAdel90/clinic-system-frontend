import type { NavItem } from "@/lib/types";

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", description: "Operational overview" }],
  },
  {
    label: "CRM",
    items: [
      { label: "Leads", href: "/leads", description: "CRM pipeline and assignments" },
      {
        label: "Lead Queue",
        href: "/lead-queue",
        description: "Round-robin queue management",
        permissions: ["view_any_call_center_queue_entry", "create_call_center_queue_entry", "delete_call_center_queue_entry"],
      },
      { label: "Lead Statuses", href: "/lead-statuses", description: "Dynamic pipeline status management" },
      { label: "Agent", href: "/agent", description: "Conversations, chat, and follow-through" },
      { label: "Campaigns", href: "/campaigns", description: "Marketing performance" },
    ],
  },
  {
    label: "Clinical",
    items: [
      { label: "Treatment Plans", href: "/treatment-plans", description: "Primary care-plan workspace and visit bundles" },
      { label: "Visits", href: "/visits", description: "Operational queue for scheduling, confirmations, and exceptions" },
      {
        label: "Medical Records",
        href: "/medical-records",
        description: "Patient files and clinical attachments",
        permissions: ["view_any_medical_record", "view_medical_record", "create_medical_record", "update_medical_record", "delete_medical_record"],
      },
      { label: "Patient Feedback", href: "/patient-feedback", description: "Post-visit sentiment and follow-through" },
      { label: "Invoices", href: "/invoices", description: "Billing and payments" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Clinics", href: "/clinics", description: "Branches and services" },
      { label: "Warehouses", href: "/warehouses", description: "Inventory and stock" },
      { label: "Pharmaceuticals", href: "/pharmaceuticals", description: "Medication catalog" },
      { label: "Suppliers", href: "/suppliers", description: "Vendors, supplier batches, and payments" },
    ],
  },
  {
    label: "Administration",
    items: [
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
      {
        label: "Settings",
        href: "/settings",
        description: "Meta messaging credentials and webhook setup",
        adminOnly: true,
      },
    ],
  },
];
