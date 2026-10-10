import { ReceiptDownloadScreen } from "@/webnext/features/public/receipt/ReceiptDownloadScreen";

// Public, unauthenticated -- the link a client or staff member gets after
// a payment is approved. Outside (main)'s AuthGate/sidebar, matching
// web-next's own real /receipt/:token route and this shell's own
// /sve-report/:token route.
export default function Page() {
  return (
    <div className="webnext-theme">
      <ReceiptDownloadScreen />
    </div>
  );
}
