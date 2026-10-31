import { QuotationDownloadScreen } from "@/webnext/features/public/quotation/QuotationDownloadScreen";

// Public, unauthenticated -- the link a prospect (or a staff member
// forwarding it) gets after a Quotation PDF is generated. Outside
// (main)'s AuthGate/sidebar, matching this shell's own real /contract/:token,
// /receipt/:token and /sve-report/:token routes.
export default function Page() {
  return (
    <div className="webnext-theme">
      <QuotationDownloadScreen />
    </div>
  );
}
