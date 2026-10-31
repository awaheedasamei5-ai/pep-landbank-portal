import { PortalBackLink } from "../_components/portal-navigation";
import { SettingsScreen } from "./_components/settings-screen";

export default function SettingsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PortalBackLink fallback="/dashboard/default" />
      <SettingsScreen />
    </div>
  );
}
