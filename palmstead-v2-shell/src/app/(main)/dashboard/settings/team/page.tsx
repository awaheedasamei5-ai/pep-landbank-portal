import { PortalBackLink } from "../../_components/portal-navigation";
import { TeamSettings } from "./_components/team-settings";

export default function TeamSettingsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PortalBackLink fallback="/dashboard/settings" />
      <TeamSettings />
    </div>
  );
}
