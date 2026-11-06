import { PageHeader } from "@/components/page-header";
import { TabsContent } from "@/components/ui/tabs";

import { PortalBackLink } from "../_components/portal-navigation";
import { DraftsPanel } from "./_components/drafts-panel";
import { OutgoingSmsGuard } from "./_components/outgoing-sms-guard";
import { OutgoingSmsTabs } from "./_components/outgoing-sms-tabs";
import { SentHistoryPanel } from "./_components/sent-history-panel";
import { TemplatesPanel } from "./_components/templates-panel";

// Outgoing SMS app (docs/plans/43 follow-up request, 2026-11-06):
// Management-only review surface for every automated SMS in the system.
// Templates tab edits the real wording/AI prompt each kind actually uses
// at send time (sms_templates); Drafts reviews the new closing/nurture
// campaign before it reaches a real client (the only kind that requires
// human sign-off); Sent history is a real audit log of what went out.
export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <PortalBackLink fallback="/dashboard/default" />
      </div>
      <PageHeader
        title="Outgoing SMS"
        description="Review and edit the wording every automated message uses, and approve the closing/nurture SMS before it reaches a client."
      />

      <OutgoingSmsGuard>
        <OutgoingSmsTabs>
          <TabsContent value="templates">
            <TemplatesPanel />
          </TabsContent>
          <TabsContent value="drafts">
            <DraftsPanel />
          </TabsContent>
          <TabsContent value="sent">
            <SentHistoryPanel />
          </TabsContent>
        </OutgoingSmsTabs>
      </OutgoingSmsGuard>
    </div>
  );
}
