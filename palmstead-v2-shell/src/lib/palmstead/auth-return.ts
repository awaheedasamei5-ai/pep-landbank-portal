const KEY = "palmstead_daily_report_after_login";
const REPORT_PATH =
  /^\/dashboard\/pipeline\/daily-reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rememberDailyReportReturn(pathname: string): void {
  if (typeof window !== "undefined" && REPORT_PATH.test(pathname)) window.sessionStorage.setItem(KEY, pathname);
}

export function validDailyReportReturn(pathname: string | null, role: string): string | null {
  return role === "manager" && pathname && REPORT_PATH.test(pathname) ? pathname : null;
}

export function takeDailyReportReturn(role: string): string | null {
  if (typeof window === "undefined") return null;
  const pathname = window.sessionStorage.getItem(KEY);
  window.sessionStorage.removeItem(KEY);
  return validDailyReportReturn(pathname, role);
}
