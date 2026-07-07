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
};
