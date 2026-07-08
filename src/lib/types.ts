export type ApiRecord = Record<string, unknown>;

export type Role = {
  id: number;
  name: string;
  guard_name?: string;
  permissions?: ApiRecord[];
};

export type User = {
  id: number;
  name: string;
  email: string;
  roles?: Role[];
  title?: string | null;
  phone_number?: string | null;
  is_active?: boolean;
};

export type LoginResponse = {
  token: string;
  token_type?: string;
  user: User;
};

export type NavItem = {
  label: string;
  href: string;
  description: string;
  roles?: string[];
};

export type Lead = {
  id: number;
  name?: string | null;
  phone?: string | null;
  platform?: string | null;
  campaign_id?: number | null;
  clinic_id?: number | null;
  clinic_assigned_at?: string | null;
  lead_status_id?: number | null;
  profile_name?: string | null;
  whatsapp_id?: string | null;
  created_at?: string | null;
  clinic?: Clinic | null;
  assignment_state?: AssignmentState | null;
  lead_status?: LeadStatus | null;
  conversations?: Conversation[];
};

export type Visit = {
  id: number;
  lead_id: number;
  user_id?: number | null;
  clinic_id?: number | null;
  scheduled_date?: string | null;
  visit_date?: string | null;
  status?: string | null;
  services_cost?: number | null;
  supplies_cost?: number | null;
  total_cost?: number | null;
};

export type Conversation = {
  id: number;
  lead_id?: number | null;
  assigned_user_id?: number | null;
  platform?: string | null;
  status?: string | null;
  last_message_time?: string | null;
  first_message_time?: string | null;
  lead_status?: string | null;
  converted_at?: string | null;
  lead?: Lead | null;
};

export type MessageRecord = {
  id: number;
  body?: string | null;
  type?: string | null;
  direction?: string | null;
  media_url?: string | null;
  media_caption?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  user?: User | null;
};

export type FollowUp = {
  id: number;
  user_id?: number | null;
  body?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  conversation?: Conversation | null;
};

export type AssignmentState = {
  lead_id: number;
  user_id: number;
  user?: User | null;
};

export type AgentMetrics = {
  user_id: number;
  user_name: string;
  average_response_time?: number | null;
  total_number_of_leads: number;
  total_converted_leads: number;
  total_reminders: number;
  completed_reminders: number;
  pending_reminders: number;
  total_customer_attendance: number;
  snapshot_date?: string | null;
};

export type Invoice = {
  id: number;
  invoice_number?: string | null;
  lead_id?: number | null;
  clinic_id?: number | null;
  total_cost?: number | null;
  amount_paid?: number | null;
  status?: string | null;
  issued_at?: string | null;
};

export type Clinic = {
  id: number;
  name: string;
};

export type Campaign = {
  id: number;
  name: string;
};

export type LeadStatus = {
  id: number;
  label: string;
  key?: string;
  color?: string | null;
};
