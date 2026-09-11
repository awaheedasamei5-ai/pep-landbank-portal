"use client";

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { redactPII } from '../../../shared/lib/redact';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildSveDayReportPdf, sveDayReportFilename } from '../lib/sveReportPdf';
import type { SveDayReport, SveDayReportEntry, SveDayReportPatch, SveSubmissionRecord } from '../../../types/domain';

export function useSveVisits() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['sveVisits'], queryFn: () => getDataSource(demoMode).sve.listVisitsWithStatus() });
}

// Real user ask (2026-09-06): "one of the requirements for all the apps
// was real time intelligence" -- a real gap: this screen only ever loaded
// site_visits/invites/submissions/day-reports once per mount, so a visit
// logged from another screen (or another staff member's device) never
// showed up here until a manual reload, even though this same screen's
// own "1 client visited, build report" summary made it look live. Same
// postgres_changes pattern useDashboardRealtime already established --
// the 4 tables here were just added to the supabase_realtime publication
// (they weren't in it at all before), so this actually fires now.
export function useSveRealtime() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (demoMode) return;
    const client = getSupabaseClient();
    if (!client) return;

    const invalidateVisits = () => queryClient.invalidateQueries({ queryKey: ['sveVisits'] });
    const invalidateReports = () => {
      queryClient.invalidateQueries({ queryKey: ['sveDayReports'] });
      queryClient.invalidateQueries({ queryKey: ['sveDayReport'] });
    };

    const channel = client
      .channel('sve-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visits' }, invalidateVisits)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visit_experience_invites' }, invalidateVisits)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visit_experience_submissions' }, invalidateVisits)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sve_day_reports' }, invalidateReports)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [demoMode, queryClient]);
}

// Real gap closed here: createInvite() only ever wrote the invite row --
// nothing ever actually sent the client the link, so every "sent" invite
// was really unsent. Matches index.html's real message/link shape
// (index.html:15412-15416) -- location.origin/pathname + '?sve=' there is
// this app's own real public route, /visit-feedback/:token (router.tsx).
//
// Real bug fixed 2026-09-06: the SMS send result was silently discarded
// (`.catch(() => {})` on a call that never actually rejects -- ds.sms.send
// always resolves to a boolean, it doesn't throw) -- so a real Arkesel
// failure (bad number, no credit, provider outage) looked IDENTICAL in
// the UI to a genuine successful send: the invite card just said "Awaiting
// response" either way, with no sign the client was never actually
// texted. Since SMS is the ONLY channel a client (who has no app account)
// can receive this link through, silently losing that failure meant
// staff had no way to know the client needed the Copy Link fallback
// instead. Now the real send result comes back on the mutation so the
// screen can warn immediately.
export function useSendSveInvite() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ siteVisitId, clientName, clientContact }: { siteVisitId: string; clientName: string; clientContact: string }) => {
      const invite = await getDataSource(demoMode).sve.createInvite(siteVisitId, clientName, clientContact, profile?.key ?? '');
      let smsSent = false;
      if (clientContact) {
        const link = `${window.location.origin}/visit-feedback/${invite.token}`;
        const firstName = clientName ? clientName.split(' ')[0] : 'there';
        const msg = `Hi ${firstName}, thank you for honoring our invitation for a site visit to Royal Palm Enclave! We'd love your feedback -- please share your experience here: ${link}`;
        smsSent = await getDataSource(demoMode)
          .sms.send(clientContact, msg, 'site_visit_experience_invite', profile?.key ?? null)
          .catch(() => false);
      }
      return { invite, smsSent };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sveVisits'] }),
  });
}

// Real user ask (2026-09-05): "the report isn't supposed to be for a
// single client after client but a full report after every site visit."
// One SveDayReport per real site-visit day, covering every client
// visited that day -- getOrCreate mirrors weeklyVisitForms' own shape
// exactly (open the day, get back either the existing draft or a freshly
// seeded one built from that day's real site visits).
export function useSveDayReport(visitDate: string | null) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['sveDayReport', visitDate],
    queryFn: () => getDataSource(demoMode).sve.getOrCreateDayReport(visitDate as string),
    enabled: !!visitDate,
  });
}

export function useSaveSveDayReport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SveDayReportPatch }) => getDataSource(demoMode).sve.saveDayReport(id, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['sveDayReport', updated.visitDate], updated);
      queryClient.invalidateQueries({ queryKey: ['sveDayReports'] });
    },
  });
}

export function useSveDayReportsList() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['sveDayReports'], queryFn: () => getDataSource(demoMode).sve.listDayReports() });
}

// Stage 1 of the two-stage AI pass, real user ask: "the ai analyzes all
// the submission, then build it into client after client feedback
// section with what each client is saying." One call per client (not one
// big batched call) -- same proven "one focused call, plain text back"
// pattern every other AI-draft feature in this app already uses, rather
// than asking the model to return structured JSON for several clients at
// once and hoping it parses. The client's real name/contact are NEVER
// sent to the model, same redaction discipline as the old per-submission
// draft this replaces.
export function useGenerateClientFeedback() {
  return useMutation({
    mutationFn: async (submission: SveSubmissionRecord) => {
      const client = getSupabaseClient();
      if (!client) return '';
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'sve_client_feedback_summary',
          context: {
            journeyRating: submission.journeyRating,
            relationshipRating: submission.relationshipRating,
            siteDescriptionRating: submission.siteDescriptionRating,
            overallRating: submission.overallRating,
            npsScore: submission.npsScore,
            purchaseIntent: submission.purchaseIntent,
            handlingFeedbackRedacted: redactPII(submission.handlingFeedback ?? ''),
            belowExpectationReasonRedacted: redactPII(submission.belowExpectationReason ?? ''),
            improvementSuggestionsRedacted: redactPII(submission.improvementSuggestions ?? ''),
            additionalCommentsRedacted: redactPII(submission.additionalComments ?? ''),
          },
        },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? '';
    },
  });
}

// Stage 2 of the two-stage AI pass, real user ask: "after he writes the
// summary, the ai can help him rephrase the tenses or rewrite it into a
// professional summary make sure that the ai doesn't write just normal
// English that doesn't make any technical sense." Rewrites the site
// manager's OWN typed text (day-level or one client's notes) rather than
// composing anything new -- `scope` tells the model which of the two it
// is.
export function usePolishManagerNarrative() {
  return useMutation({
    mutationFn: async ({ scope, rawNotes }: { scope: 'day' | 'client'; rawNotes: string }) => {
      const client = getSupabaseClient();
      if (!client) return '';
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'sve_manager_narrative_polish', context: { scope, rawNotesRedacted: redactPII(rawNotes) } },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? '';
    },
  });
}

// Real user ask: "the system will compile all the parts to a carefully
// designed professional pdf file ... that pdf is submitted to management
// via an sms link they can click and view and also the staff can also
// download it via download report button ... use the company number to
// send to management." Same tokenized-share + notify pattern the old
// per-submission flow already used, just pointed at the day report.
export function useSendSveDayReport() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: config } = useConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (report: SveDayReport) => {
      const ds = getDataSource(demoMode);
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the report from generating.
      }
      const doc = buildSveDayReportPdf(report, logo);
      const blob = doc.output('blob');
      const token = await ds.sve.issueDayReportLink(report.id, blob, profile?.key ?? '', profile?.name ?? '');
      const link = `${window.location.origin}/sve-report/${token}`;
      const body = `Site Visit Experience report ready for ${report.site} (${report.visitDate}), ${report.entries.length} client${report.entries.length === 1 ? '' : 's'}. View it: ${link}`;

      const managers = await ds.staff.list().catch(() => []);
      const toManagers = managers.filter((m) => m.role === 'manager' && m.key !== profile?.key);
      if (toManagers.length > 0) {
        ds.notifications.notify(profile?.key ?? '', profile?.name ?? '', toManagers.map((m) => m.key), body, 'sve_report_ready', 'sve_day_report', report.id).catch(() => {});
      }
      const phones = new Set(toManagers.map((m) => m.phone).filter((p): p is string => !!p));
      if (config?.companyPhone) phones.add(config.companyPhone);
      for (const phone of phones) ds.sms.send(phone, body, 'sve_report_ready', profile?.key ?? null).catch(() => {});

      doc.save(sveDayReportFilename(report.visitDate));
      return token;
    },
    onSuccess: (_token, report) => {
      queryClient.setQueryData(['sveDayReport', report.visitDate], (prev: SveDayReport | undefined) => (prev ? { ...prev, status: 'sent' as const } : prev));
      queryClient.invalidateQueries({ queryKey: ['sveDayReports'] });
    },
  });
}

// Real user ask: "the staff can also download it via download report
// button." Rebuilds the PDF fresh from the report's own already-loaded
// data (no storage fetch needed) -- used both for a quick look at a
// still-draft report and for re-downloading an already-sent one.
export function useDownloadSveDayReportPdf() {
  return useMutation({
    mutationFn: async (report: SveDayReport) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the report from generating.
      }
      const doc = buildSveDayReportPdf(report, logo);
      doc.save(sveDayReportFilename(report.visitDate));
    },
  });
}

export type { SveDayReportEntry };
