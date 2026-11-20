import {
  LayoutDashboard,
  Receipt,
  Shield,
  FolderKanban,
  CheckSquare,
  Wallet,
  Banknote,
  Tag,
  Settings,
  PenLine,
  Users,
  Server,
  Mail,
  Inbox,
  Sparkles,
  Trash2,
  Database,
  User,
  Camera,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

export const NAV: NavItem[] = [
  { href: "/profile", labelKey: "profile", icon: User, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/expenses", labelKey: "expenses", icon: Receipt, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/insurance", labelKey: "insurance", icon: Shield, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/reports", labelKey: "reports", icon: FolderKanban, roles: ["technician", "manager", "chef_finance", "mod"] },
  { href: "/approvals", labelKey: "review_reports", icon: CheckSquare, roles: ["manager", "chef_finance"] },
  { href: "/advances", labelKey: "advances", icon: Wallet, roles: ["manager", "chef_finance", "mod"] },
  { href: "/payments", labelKey: "process_payments", icon: Banknote, roles: ["chef_finance"] },
  { href: "/categories", labelKey: "expense_categories", icon: Tag, roles: ["mod"] },
  { href: "/admin/settings", labelKey: "settings", icon: Settings, roles: ["chef_finance"] },
  { href: "/profile/signature", labelKey: "signature", icon: PenLine, roles: ["technician", "manager", "chef_finance", "mod"] },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", labelKey: "users", icon: Users, roles: ["mod", "manager", "chef_finance"] },
  { href: "/admin/ldap", labelKey: "ldap_ad", icon: Server, roles: ["mod"] },
  { href: "/admin/email", labelKey: "email_smtp", icon: Mail, roles: ["mod"] },
  { href: "/admin/imap", labelKey: "email_imap", icon: Inbox, roles: ["mod"] },
  { href: "/admin/ocr", labelKey: "ocr_scanner", icon: Sparkles, roles: ["mod"] },
  { href: "/admin/receipts", labelKey: "receipts_cleanup", icon: Trash2, roles: ["mod"] },
  { href: "/admin/storage", labelKey: "storage_settings", icon: Database, roles: ["mod"] },
];

/** Routes that have a nav label but are not sidebar entries (used for page titles). */
const EXTRA_TITLE_ROUTES: NavItem[] = [
  { href: "/expenses/capture", labelKey: "capture", icon: Camera, roles: [] },
  { href: "/search", labelKey: "search", icon: LayoutDashboard, roles: [] },
];

const TITLE_ROUTES = [...NAV, ...ADMIN_NAV, ...EXTRA_TITLE_ROUTES].sort(
  (a, b) => b.href.length - a.href.length,
);

/** Longest-prefix lookup of the nav label key for a pathname. */
export function navLabelKeyFor(pathname: string): string | null {
  const match = TITLE_ROUTES.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
  return match ? match.labelKey : null;
}
