import { redirect } from "next/navigation";

import { PortalBackLink } from "../../_components/portal-navigation";
import { AccessSettings } from "./_components/access-settings";

export default function AccessSettingsPage() {
  if (process.env.NEXT_PUBLIC_ACCESS_SETTINGS_ENABLED !== "true") redirect("/dashboard/settings");
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PortalBackLink fallback="/dashboard/settings" />
      <AccessSettings />
    </div>
  );
}
