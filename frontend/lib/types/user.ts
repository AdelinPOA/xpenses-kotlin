export interface User {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: "technician" | "manager" | "chef_finance" | "mod";
  is_active: boolean;
  auth_source: "local" | "ldap";
  has_signature?: boolean;
  notifications_enabled?: boolean;
  language?: string;
  created_at: string;
  updated_at: string;
}
