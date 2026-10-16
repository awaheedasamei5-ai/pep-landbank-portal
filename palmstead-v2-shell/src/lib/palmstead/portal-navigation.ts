export type PortalRole = "agent" | "manager";

export const portalRoutePatterns = [
  "/dashboard/allocations",
  "/dashboard/announcements",
  "/dashboard/attendance",
  "/dashboard/attendance/corrections",
  "/dashboard/attendance/exceptions",
  "/dashboard/attendance/management",
  "/dashboard/attendance/management/exceptions",
  "/dashboard/attendance/management/records",
  "/dashboard/attendance/management/settings",
  "/dashboard/banners",
  "/dashboard/banners/[id]",
  "/dashboard/chat",
  "/dashboard/clients",
  "/dashboard/clients/[key]",
  "/dashboard/company-leads",
  "/dashboard/company-leads/[id]",
  "/dashboard/complaints",
  "/dashboard/complaints/new",
  "/dashboard/default",
  "/dashboard/directory",
  "/dashboard/enquiries",
  "/dashboard/enquiries/new",
  "/dashboard/finance",
  "/dashboard/leave",
  "/dashboard/leave/emergency",
  "/dashboard/leave/management",
  "/dashboard/leave/management/calendar",
  "/dashboard/leave/management/reminders",
  "/dashboard/leave/management/reports",
  "/dashboard/leave/management/reports/reminders",
  "/dashboard/leave/management/requests",
  "/dashboard/leave/management/settings",
  "/dashboard/leave/plan",
  "/dashboard/leave/reports",
  "/dashboard/leave/requests",
  "/dashboard/leave/requests/[id]",
  "/dashboard/leave/requests/[id]/edit",
  "/dashboard/leave/requests/new",
  "/dashboard/memorandum",
  "/dashboard/notes",
  "/dashboard/operations",
  "/dashboard/operations/[projectId]",
  "/dashboard/operations/[projectId]/issues/[issueId]",
  "/dashboard/operations/reports",
  "/dashboard/operations/settings/data",
  "/dashboard/pipeline",
  "/dashboard/pipeline/[id]",
  "/dashboard/pipeline/archived",
  "/dashboard/pipeline/new",
  "/dashboard/plots",
  "/dashboard/plots/[id]",
  "/dashboard/plots/reconciliation",
  "/dashboard/profile",
  "/dashboard/quotation",
  "/dashboard/quotation/technical",
  "/dashboard/referrals",
  "/dashboard/referrals/new",
  "/dashboard/site-visit-authorization",
  "/dashboard/site-visits",
  "/dashboard/site-visits/experience",
  "/dashboard/site-visits/new",
  "/dashboard/staff-hub",
] as const;

const appNames: Record<string, string> = {
  default: "Home",
  pipeline: "Pipeline",
  clients: "Client database",
  plots: "Plot inventory",
  allocations: "Allocations",
  "site-visits": "Site visits",
  enquiries: "Enquiries",
  referrals: "Referrals",
  complaints: "Complaints",
  "company-leads": "Company leads",
  directory: "Directory",
  "staff-hub": "Staff Hub",
  operations: "Operations",
  memorandum: "Memorandum",
  attendance: "Attendance",
  finance: "Accounting",
  quotation: "Quotation",
  leave: "Leave",
  notes: "Notes",
  banners: "Banner tracking",
  "site-visit-authorization": "Site visit authorization",
  announcements: "Announcements",
  profile: "Profile",
  chat: "Chat",
};
const home = "/dashboard/default";
const base = "https://palmstead.invalid";
function hasControls(value: string, rejectSpace = false) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || (rejectSpace && code === 32);
  });
}
const returnKey = /^(return_?to|back_?to)$/i;
const credentialKey = /^(access_token|refresh_token|password|passwd|authorization)$/i;

function split(path: string) {
  return path.split("/").filter(Boolean);
}
function dynamic(segment: string) {
  return segment.startsWith("[") && segment.endsWith("]");
}

/** Validate the path BEFORE URL normalizes dot segments. No browser/Next internals. */
export function safePortalHref(value: unknown, role?: PortalRole): string | null {
  if (typeof value !== "string" || !value || value.length > 4096 || hasControls(value, true) || value.includes("\\"))
    return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  const rawPath = value.split(/[?#]/, 1)[0];
  if (rawPath.includes("//")) return null;
  for (const segment of split(rawPath)) {
    let decoded = segment;
    for (let level = 0; level < 4; level++) {
      if (decoded === "." || decoded === ".." || /[/\\\\]/.test(decoded) || hasControls(decoded)) return null;
      let next: string;
      try {
        next = decodeURIComponent(decoded);
      } catch {
        return null;
      }
      if (next === decoded) break;
      if (level === 3) return null;
      decoded = next;
    }
  }
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  url.pathname = url.pathname.replace(/\/$/, "");
  if (url.pathname === "/dashboard") url.pathname = home;
  if (!matchPortalRoute(url.pathname) || !portalRoleAllows(url.pathname, role)) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (returnKey.test(key) || credentialKey.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.pathname + (url.searchParams.size ? `?${url.searchParams.toString()}` : "");
}

export function matchPortalRoute(pathname: string): string | null {
  const actual = split(pathname);
  const matches = portalRoutePatterns.filter((pattern) => {
    const parts = split(pattern);
    return parts.length === actual.length && parts.every((part, index) => dynamic(part) || part === actual[index]);
  });
  // Static patterns beat dynamic placeholders of the same length.
  return [...matches].sort((a, b) => split(a).filter(dynamic).length - split(b).filter(dynamic).length)[0] ?? null;
}

export function portalRoleAllows(pathname: string, role?: PortalRole) {
  const restricted = [
    "/dashboard/leave/management",
    "/dashboard/attendance/management",
    "/dashboard/operations/settings/data",
  ];
  const management = restricted.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !management || role === "manager";
}

export function portalTitle(href: string): string {
  const path = href.split("?")[0];
  const parts = split(path);
  const app = appNames[parts[1]] ?? "Home";
  const pattern = matchPortalRoute(path);
  if (!pattern || parts.length === 2) return app;
  if (pattern === "/dashboard/operations/[projectId]") return "Project";
  if (pattern.endsWith("/issues/[issueId]")) return "Work item";
  if (pattern.endsWith("/requests/[id]")) return "Leave request";
  const tail = parts.at(-1) ?? "";
  const titles: Record<string, string> = {
    reports: `${app} reports`,
    management: `${app} management`,
    settings: `${app} settings`,
    requests: "Leave requests",
    calendar: `${app} calendar`,
    reminders: "Leave reminders",
    plan: "Leave plan",
    corrections: "Attendance corrections",
    exceptions: `${app} exceptions`,
    records: "Attendance records",
    data: "Reset test data",
    archived: "Archived leads",
    reconciliation: "Plot reconciliation",
  };
  return titles[tail] ?? app;
}

export function portalParent(href: string, role?: PortalRole): string {
  const path = href.split("?")[0];
  const pattern = matchPortalRoute(path);
  if (!pattern) return home;
  const current = split(pattern);
  const actual = split(path);
  const parents = portalRoutePatterns
    .filter((candidate) => {
      const parts = split(candidate);
      // Match pattern ancestry, not just actual strings: /operations/settings
      // must never be mistaken for /operations/[projectId].
      return parts.length < current.length && parts.every((part, index) => part === current[index]);
    })
    .sort((a, b) => split(b).length - split(a).length);
  for (const parent of parents) {
    const target = `/${actual.slice(0, split(parent).length).join("/")}`;
    if (portalRoleAllows(target, role)) return target;
  }
  return home;
}

export function portalViewKey(href: string) {
  const url = new URL(href, base);
  return `${url.pathname}|${["view", "tab"].map((key) => `${key}=${url.searchParams.get(key) ?? ""}`).join("&")}`;
}

export type PortalVisit = { href: string; key: string };
export type PortalTrail = { entries: PortalVisit[]; index: number };
export const emptyPortalTrail = (): PortalTrail => ({ entries: [], index: -1 });

export function recordPortalVisit(
  state: PortalTrail,
  raw: string,
  kind: "visit" | "replace" | "pop" = "visit",
  role?: PortalRole,
): PortalTrail {
  const href = safePortalHref(raw, role);
  if (!href) return state;
  const visit = { href, key: portalViewKey(href) };
  if (kind === "pop") {
    let index = state.entries.findLastIndex((entry) => entry.href === href);
    if (index < 0) index = state.entries.findLastIndex((entry) => entry.key === visit.key);
    if (index < 0) return { entries: [visit], index: 0 };
    return { entries: state.entries.map((entry, i) => (i === index ? visit : entry)), index };
  }
  if (state.index >= 0 && (kind === "replace" || state.entries[state.index]?.key === visit.key)) {
    return { entries: state.entries.map((entry, i) => (i === state.index ? visit : entry)), index: state.index };
  }
  const entries = [...state.entries.slice(0, state.index + 1), visit].slice(-80);
  return { entries, index: entries.length - 1 };
}

export type PortalReturn = { href: string; source: "explicit" | "trail" | "parent"; index: number };

export function resolvePortalReturn(
  rawCurrent: string,
  state: PortalTrail,
  fallback?: string,
  role?: PortalRole,
): PortalReturn {
  const current = safePortalHref(rawCurrent, role) ?? home;
  const key = portalViewKey(current);
  const different = (value: string | null): value is string => Boolean(value && portalViewKey(value) !== key);
  let explicit: string | null = null;
  try {
    const values = new URL(rawCurrent, base).searchParams.getAll("returnTo");
    if (values.length === 1) explicit = safePortalHref(values[0], role);
  } catch {
    /* Invalid context uses a known local parent. */
  }
  if (different(explicit)) {
    return {
      href: explicit,
      source: "explicit",
      index: state.entries.findLastIndex((entry, i) => i <= state.index && entry.key === portalViewKey(explicit)),
    };
  }
  const start = state.entries[state.index]?.key === key ? state.index - 1 : state.index;
  for (let index = start; index >= 0; index--) {
    const target = safePortalHref(state.entries[index].href, role);
    if (different(target)) return { href: target, source: "trail", index };
  }
  const supplied = safePortalHref(fallback, role);
  return { href: different(supplied) ? supplied : portalParent(current, role), source: "parent", index: -1 };
}

export function applyPortalReturn(state: PortalTrail, target: PortalReturn): PortalTrail {
  const visit = { href: target.href, key: portalViewKey(target.href) };
  if (target.index >= 0 && target.index <= state.index) {
    return { entries: [...state.entries.slice(0, target.index), visit], index: target.index };
  }
  const entries = [...state.entries.slice(0, Math.max(0, state.index)), visit].slice(-80);
  return { entries, index: entries.length - 1 };
}

export function portalHrefWithReturnTo(href: string, from: string, role?: PortalRole): string {
  const target = safePortalHref(href, role);
  const source = safePortalHref(from, role);
  if (!target) return home;
  if (!source || portalViewKey(source) === portalViewKey(target)) return target;
  const url = new URL(target, base);
  url.searchParams.set("returnTo", source);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
