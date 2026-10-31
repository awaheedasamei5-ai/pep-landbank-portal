import { PortalBackLink } from "../../_components/portal-navigation";
import { AccessSettings } from "./_components/access-settings";

export default function AccessSettingsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PortalBackLink fallback="/dashboard/settings" />
      <AccessSettings />
    </div>
  );
}

