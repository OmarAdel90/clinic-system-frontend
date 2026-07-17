import type { NavItem } from "@/lib/types";

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        description: "Operational overview",
        permissions: ["view_dashboard"],
      },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Leads", href: "/leads", description: "CRM pipeline and assignments", permissions: ["view_any_lead"] },
      {
        label: "Lead Queue",
        href: "/lead-queue",
        description: "Round-robin queue management",
        permissions: ["view_any_call_center_queue_entry", "create_call_center_queue_entry", "delete_call_center_queue_entry"],
      },
      { label: "Lead Statuses", href: "/lead-statuses", description: "Dynamic pipeline status management", permissions: ["view_any_lead_status"] },
      { label: "Agent", href: "/agent", description: "Conversations, chat, and follow-through", permissions: ["view_any_conversation"] },
      { label: "Campaigns", href: "/campaigns", description: "Marketing performance", permissions: ["view_any_campaign"] },
    ],
  },
  {
    label: "Clinical",
    items: [
      { label: "Treatment Plans", href: "/treatment-plans", description: "Primary care-plan workspace and visit bundles", permissions: ["view_any_treatment_plan"] },
      { label: "Visits", href: "/visits", description: "Operational queue for scheduling, confirmations, and exceptions", permissions: ["view_any_visit"] },
      {
        label: "Reports",
        href: "/reports",
        description: "Doctor notes, visit outcomes, and completed care records",
        permissions: ["view_any_report"],
      },
      {
        label: "Medical Records",
        href: "/medical-records",
        description: "Patient files and clinical attachments",
        permissions: ["view_any_medical_record"],
      },
      { label: "Patient Feedback", href: "/patient-feedback", description: "Post-visit sentiment and follow-through", permissions: ["view_any_patient_feedback"] },
      { label: "Invoices", href: "/invoices", description: "Billing and payments", permissions: ["view_any_invoice"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Clinics", href: "/clinics", description: "Branches and services", permissions: ["view_any_clinic"] },
      { label: "Warehouses", href: "/warehouses", description: "Inventory and stock", permissions: ["view_any_warehouse"] },
      { label: "Pharmaceuticals", href: "/pharmaceuticals", description: "Medication catalog", permissions: ["view_any_pharmaceutical"] },
      { label: "Suppliers", href: "/suppliers", description: "Vendors, supplier batches, and payments", permissions: ["view_any_supplier"] },
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
