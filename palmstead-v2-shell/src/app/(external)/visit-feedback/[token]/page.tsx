import { SveFeedbackScreen } from "@/webnext/features/public/sve/SveFeedbackScreen";

// Public, unauthenticated -- the link a client receives by SMS after a
// Site Visit Experience invite. Outside (main)'s AuthGate/sidebar on
// purpose, matching web-next's own real /visit-feedback/:token route.
export default function Page() {
  return (
    <div className="webnext-theme">
      <SveFeedbackScreen />
    </div>
  );
}
