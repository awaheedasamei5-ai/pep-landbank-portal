import { ContractDownloadScreen } from "@/webnext/features/public/contract/ContractDownloadScreen";

// Public, unauthenticated -- the link a client (or a staff member
// forwarding it) gets after a Contract of Sale is generated. Outside
// (main)'s AuthGate/sidebar, matching this shell's own real /receipt/:token
// and /sve-report/:token routes.
export default function Page() {
  return (
    <div className="webnext-theme">
      <ContractDownloadScreen />
    </div>
  );
}
