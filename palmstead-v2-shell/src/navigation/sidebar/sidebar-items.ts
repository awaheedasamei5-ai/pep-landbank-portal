import {
  AlertTriangle,
  Banknote,
  Bell,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardList,
  Compass,
  FileSignature,
  FileText,
  Fingerprint,
  Gauge,
  Home,
  Landmark,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  ReceiptText,
  Send,
  Server,
  Settings,
  ShieldCheck,
  StickyNote,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

// Palmstead's real app list (the same groups/apps web-next's own sidebar
// carries, itself ported from v1) -- rebuilt here as the shell's real
// navigation rather than the template's demo dashboards. Every app not
// yet built in THIS shell points at /dashboard/coming-soon (a real,
// honest "not built yet" page the template already ships, reused rather
// than left as a dead link) instead of a broken route -- swap the `url`
// to the real route the moment that app actually exists here.
const NOT_BUILT_YET = "/dashboard/coming-soon";

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Overview",
    items: [{ id: "home", title: "Home", url: "/dashboard/default", icon: Home }],
  },
  {
    id: 2,
    label: "Sales",
    items: [
      { id: "master-pipeline", title: "Master Pipeline", url: "/dashboard/pipeline", icon: Gauge },
      { id: "client-database", title: "Client Database", url: "/dashboard/clients", icon: Users },
      { id: "plot-inventory", title: "Plot Inventory", url: "/dashboard/plots", icon: Boxes },
      { id: "allocations", title: "Allocations", url: "/dashboard/allocations", icon: MapPin },
      { id: "site-visits", title: "Site Visits", url: "/dashboard/site-visits", icon: Compass },
      { id: "enquiries", title: "Enquiries", url: "/dashboard/enquiries", icon: Phone },
      { id: "referrals", title: "Referrals", url: "/dashboard/referrals", icon: Send },
      { id: "complaints", title: "Complaints", url: "/dashboard/complaints", icon: AlertTriangle },
      { id: "company-leads", title: "Company Leads", url: "/dashboard/company-leads", icon: Building2 },
    ],
  },
  {
    id: 3,
    label: "Office",
    items: [
      { id: "operations-tracker", title: "Operations Tracker", url: NOT_BUILT_YET, icon: ListChecks },
      { id: "memorandum", title: "Memorandum", url: NOT_BUILT_YET, icon: FileText },
      { id: "attendance", title: "Attendance", url: "/dashboard/attendance", icon: Fingerprint },
      { id: "log-payment", title: "Log Payment", url: NOT_BUILT_YET, icon: Wallet },
      { id: "contract-of-sale", title: "Contract of Sale", url: NOT_BUILT_YET, icon: FileSignature },
      { id: "quotation", title: "Quotation", url: "/dashboard/quotation", icon: ReceiptText },
      { id: "leave", title: "Leave", url: NOT_BUILT_YET, icon: CalendarClock },
      { id: "notes", title: "Notes", url: NOT_BUILT_YET, icon: StickyNote },
      { id: "banner-tracking", title: "Banner Tracking", url: "/dashboard/banners", icon: Megaphone },
      { id: "expenses", title: "Expenses", url: NOT_BUILT_YET, icon: Banknote },
      { id: "site-visit-authorization", title: "Site Visit Authorization", url: "/dashboard/site-visit-authorization", icon: ShieldCheck },
      { id: "staff-report", title: "Staff Report", url: NOT_BUILT_YET, icon: ClipboardList },
    ],
  },
  {
    id: 4,
    label: "Communication",
    items: [
      { id: "notifications", title: "Notifications", url: NOT_BUILT_YET, icon: Bell },
      { id: "chat", title: "Chat", url: NOT_BUILT_YET, icon: MessageSquare },
    ],
  },
  {
    id: 5,
    label: "Insights",
    items: [
      { id: "smart-insights", title: "Smart Insights", url: NOT_BUILT_YET, icon: Lightbulb },
      { id: "data-check", title: "Data Check", url: NOT_BUILT_YET, icon: UserCheck },
      { id: "document-vault", title: "Document Vault", url: NOT_BUILT_YET, icon: BookOpen },
      { id: "my-portfolio", title: "My Portfolio", url: NOT_BUILT_YET, icon: Briefcase },
      { id: "commission", title: "Commission", url: NOT_BUILT_YET, icon: Landmark },
      { id: "analytics", title: "Analytics", url: NOT_BUILT_YET, icon: Gauge },
      { id: "reports", title: "Reports", url: NOT_BUILT_YET, icon: FileText },
      { id: "leaderboard", title: "Leaderboard", url: NOT_BUILT_YET, icon: Trophy },
    ],
  },
  {
    id: 6,
    label: "Management",
    items: [
      { id: "team-roster", title: "Team Roster", url: NOT_BUILT_YET, icon: UserPlus },
      { id: "system-health", title: "System Health", url: NOT_BUILT_YET, icon: Server },
      { id: "settings", title: "Settings", url: NOT_BUILT_YET, icon: Settings },
    ],
  },
];
