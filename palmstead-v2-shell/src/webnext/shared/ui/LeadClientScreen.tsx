"use client";

import { useNavigate, useParams } from "react-router";
import { X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ghs } from "../lib/format";
import { qtyOfType } from "../../features/pipeline/lib/pipelineLogic";
import { useConfig } from "../../features/manager/hooks/useConfigSettings";
import { useLead } from "../../features/pipeline/hooks/useLead";
import { useCanManageCompanyLeads } from "../../features/company-leads/hooks/useCompanyLeads";
import { usePayments } from "../../features/pipeline/hooks/usePayments";
import { StageBadge } from "../../features/pipeline/components/StageBadge";
import { LeadConversationTimeline } from "../../features/pipeline/components/LeadConversationTimeline";
import {
  ActivitySection,
  AllocationEligibilitySection,
  AuditTrailSection,
  ClientSection,
  ComplaintsSection,
  CostAttributionSection,
  DangerZoneSection,
  DepositScheduleSection,
  DocumentationSection,
  EnquiriesSection,
  FollowUpSection,
  LeadDetailsSection,
  NotesSection,
  PaymentHistorySection,
  PlotPricingSection,
  SiteVisitsSection,
} from "../../features/pipeline/screens/PipelineDetailScreen";
import { ContractStatusSection } from "./ContractStatusSection";
import pipelineStyles from "../../features/pipeline/screens/PipelineDetailScreen.module.css";
import styles from "./LeadClientScreen.module.css";

function initialsOf(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.5,
// generalized for Pipeline and Client Database -- the real layered client
// page: distinct Overview / Payment History / Site Visits & Allocation /
// Contract of Sale tabs, instead of the generic PipelineDetailScreen's
// one long scroll. Every tab reuses that screen's own real, exported
// sections -- no new data logic, no fork of payment/allocation/KYC
// behavior. The caller supplies where "Close"/delete should navigate back
// to and how this client is labeled (Company Lead / Pipeline Lead).
export function LeadClientScreen({ backHref, eyebrow = "Client" }: { backHref: string; eyebrow?: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id ?? "");
  const { data: payments } = usePayments(id ?? "");
  const { data: config } = useConfig();
  const canManageCompanyLeads = useCanManageCompanyLeads();

  if (isLoading) return <div className={pipelineStyles.wrap}>Loading…</div>;
  if (!lead) return <div className={pipelineStyles.wrap}>Lead not found.</div>;

  const leadPayments = (payments ?? []).filter((p) => p.leadId === lead.id).sort((a, b) => b.date.localeCompare(a.date));
  const initials = initialsOf(lead.name);
  const balance = Math.max(lead.grandTotal - lead.amtPaid, 0);
  const pctCollected = lead.grandTotal > 0 ? Math.min(100, Math.round((lead.amtPaid / lead.grandTotal) * 100)) : 0;
  const sharedReadOnly = lead.agent === "company" && !canManageCompanyLeads;

  return (
    <div className={pipelineStyles.drawerBackdrop}>
      <div className={pipelineStyles.drawerPanel}>
        <button type="button" className={pipelineStyles.closeDrawerBtn} onClick={() => navigate(backHref)} aria-label="Close" title="Close">
          <X className="size-4" aria-hidden="true" />
        </button>
        <div className={pipelineStyles.wrap}>
          <div className={pipelineStyles.head}>
            <div className={pipelineStyles.avatar}>{initials}</div>
            <div>
              <div className={pipelineStyles.eyebrow}>{eyebrow}</div>
              <h1 className={pipelineStyles.name}>{lead.name}</h1>
              <p className={pipelineStyles.meta}>
                {lead.contact} · {lead.plotType}
                {qtyOfType(lead.plotType, lead.noPlots) > 1 ? ` ×${qtyOfType(lead.plotType, lead.noPlots)}` : ""} · <StageBadge stage={lead.stage} />
              </p>
            </div>
          </div>

          <div className={pipelineStyles.balanceCard}>
            <div className={pipelineStyles.balanceTop}>
              <div>
                <div className={pipelineStyles.balanceLabel}>Balance remaining</div>
                <div className={pipelineStyles.balanceValue}>{ghs(balance)}</div>
              </div>
              <div className={pipelineStyles.balancePct}>{pctCollected}%</div>
            </div>
            <div className={pipelineStyles.balanceTrack}>
              <div className={pipelineStyles.balanceFill} style={{ width: `${pctCollected}%` }} />
            </div>
            <div className={pipelineStyles.balanceFootRow}>
              <div>
                <div className={pipelineStyles.balanceFootVal}>{ghs(lead.grandTotal)}</div>
                <div className={pipelineStyles.balanceFootLbl}>Pipeline value</div>
              </div>
              <div>
                <div className={pipelineStyles.balanceFootVal}>{ghs(lead.amtPaid)}</div>
                <div className={pipelineStyles.balanceFootLbl}>Collected</div>
              </div>
            </div>
          </div>

          <Tabs defaultValue="overview" className={styles.tabs}>
            <TabsList className={styles.tabsList}>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="conversations">Conversations</TabsTrigger>
              <TabsTrigger value="payments">Payment History</TabsTrigger>
              <TabsTrigger value="visits">Site Visits &amp; Allocation</TabsTrigger>
              <TabsTrigger value="contract">Contract of Sale</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className={styles.tabPanel}>
              {sharedReadOnly ? (
                <div className={pipelineStyles.section}>
                  <h2 className={pipelineStyles.sectionTitle}>Shared company lead</h2>
                  <p className={pipelineStyles.emptyMsg}>You can review this lead, log calls, and book site visits. Management controls changes to its shared record.</p>
                  <div className={pipelineStyles.readRow}><span className={pipelineStyles.readLabel}>Contact</span><span>{lead.contact || "—"}</span></div>
                  <div className={pipelineStyles.readRow}><span className={pipelineStyles.readLabel}>Source</span><span>{lead.leadSource || "—"}</span></div>
                  <div className={pipelineStyles.readRow}><span className={pipelineStyles.readLabel}>Plot</span><span>{lead.plotType} ×{lead.noPlots}</span></div>
                  <div className={pipelineStyles.readRow}><span className={pipelineStyles.readLabel}>Next step</span><span>{lead.nextAction || "—"}</span></div>
                </div>
              ) : (
                <>
                  <ClientSection lead={lead} />
                  <LeadDetailsSection lead={lead} />
                  {config && <PlotPricingSection lead={lead} config={config} />}
                  <FollowUpSection lead={lead} />
                </>
              )}
              <ActivitySection lead={lead} />
              <CostAttributionSection lead={lead} />
              {!sharedReadOnly && <ComplaintsSection lead={lead} />}
              {!sharedReadOnly && <EnquiriesSection lead={lead} />}
              {!sharedReadOnly && <NotesSection lead={lead} />}
              <AuditTrailSection leadId={lead.id} paymentIds={leadPayments.map((p) => p.id)} />
              {!sharedReadOnly && <DocumentationSection lead={lead} />}
              {!sharedReadOnly && <DangerZoneSection lead={lead} onDeleted={() => navigate(backHref)} />}
            </TabsContent>

            <TabsContent value="conversations" className={styles.tabPanel}>
              <LeadConversationTimeline leads={[{ id: lead.id, label: lead.name }]} legacyNotes={lead.notes} />
            </TabsContent>

            <TabsContent value="payments" className={styles.tabPanel}>
              {!sharedReadOnly && config && <DepositScheduleSection lead={lead} config={config} payments={leadPayments} />}
              {!sharedReadOnly && <PaymentHistorySection lead={lead} payments={leadPayments} />}
              {sharedReadOnly && <div className={pipelineStyles.section}><h2 className={pipelineStyles.sectionTitle}>Payment summary</h2><div className={pipelineStyles.readRow}><span className={pipelineStyles.readLabel}>Collected</span><span>{ghs(lead.amtPaid)}</span></div><div className={pipelineStyles.readRow}><span className={pipelineStyles.readLabel}>Balance remaining</span><span>{ghs(balance)}</span></div></div>}
            </TabsContent>

            <TabsContent value="visits" className={styles.tabPanel}>
              <SiteVisitsSection lead={lead} />
              {!sharedReadOnly && config && <AllocationEligibilitySection lead={lead} config={config} payments={leadPayments} />}
            </TabsContent>

            <TabsContent value="contract" className={styles.tabPanel}>
              {sharedReadOnly ? <div className={pipelineStyles.section}><h2 className={pipelineStyles.sectionTitle}>Contract of Sale</h2><p className={pipelineStyles.emptyMsg}>Management handles contract changes for shared company leads.</p></div> : <ContractStatusSection lead={lead} />}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

