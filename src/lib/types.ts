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
  lead_status_id?: number | null;
  profile_name?: string | null;
  created_at?: string | null;
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
