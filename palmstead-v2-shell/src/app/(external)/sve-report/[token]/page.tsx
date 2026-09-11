import { SveReportDownloadScreen } from "@/webnext/features/public/sve-report/SveReportDownloadScreen";

// Public, unauthenticated -- the link Management receives by SMS once a
// staff member sends a Site Visit Experience day report. Outside
// (main)'s AuthGate/sidebar, matching web-next's own real
// /sve-report/:token route.
export default function Page() {
  return (
    <div className="webnext-theme">
      <SveReportDownloadScreen />
    </div>
  );
}
