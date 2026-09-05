import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { redactPII } from '../../../shared/lib/redact';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildSveReportPdf, sveReportFilename } from '../lib/sveReportPdf';
import type { SiteVisit, SveSubmissionRecord } from '../../../types/domain';

export function useSveVisits() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['sveVisits'], queryFn: () => getDataSource(demoMode).sve.listVisitsWithStatus() });
}

// Real gap closed here: createInvite() only ever wrote the invite row --
// nothing ever actually sent the client the link, so every "sent" invite
// was really unsent. Matches index.html's real message/link shape
// (index.html:15412-15416) -- location.origin/pathname + '?sve=' there is
// this app's own real public route, /visit-feedback/:token (router.tsx).
export function useSendSveInvite() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ siteVisitId, clientName, clientContact }: { siteVisitId: string; clientName: string; clientContact: string }) => {
      const invite = await getDataSource(demoMode).sve.createInvite(siteVisitId, clientName, clientContact, profile?.key ?? '');
      if (clientContact) {
        const link = `${window.location.origin}/visit-feedback/${invite.token}`;
        const firstName = clientName ? clientName.split(' ')[0] : 'there';
        const msg = `Hi ${firstName}, thank you for honoring our invitation for a site visit to Royal Palm Enclave! We'd love your feedback -- please share your experience here: ${link}`;
        getDataSource(demoMode)
          .sms.send(clientContact, msg, 'site_visit_experience_invite', profile?.key ?? null)
          .catch(() => {});
      }
      return invite;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sveVisits'] }),
  });
}

// Real user ask: "the ai is able to analyze [the submission] and help the
// staff build the report." Same direct ai-insights call pattern as
// useFollowUpDraft -- a mutation (an explicit "draft this" tap, never
// auto-fired), the client's real name/phone are NEVER sent to the model
// (kind='sve_report_draft' is told only the ratings + redacted free text),
// and the returned draft is meant to be reviewed/edited by staff before
// useSendSveReport below ever turns it into something Management sees.
export function useGenerateSveReportDraft() {
  return useMutation({
    mutationFn: async (submission: SveSubmissionRecord) => {
      const client = getSupabaseClient();
      if (!client) return '';
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'sve_report_draft',
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

// Real user ask: "when the report is ready, it's sent to management via
// their system and also through an sms link where they click to access
// the pdf report." Builds the PDF (staff's own reviewed/edited text, not
// necessarily the raw AI draft), uploads it and gets back a tokenized
// share link (sve.issueReportLink -- same real trust model as receipts'
// own issueReceiptLink), then notifies Management in-app + SMS with that
// link, same ds.staff.list()-filtered-by-role/company_phone pattern
// every other "notify Management" call site in this app uses.
export function useSendSveReport() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: config } = useConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ siteVisit, submission, reportText }: { siteVisit: SiteVisit; submission: SveSubmissionRecord; reportText: string }) => {
      const ds = getDataSource(demoMode);
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the report from generating.
      }
      const doc = buildSveReportPdf(siteVisit, submission, reportText, profile?.name ?? '', logo);
      const blob = doc.output('blob');
      const token = await ds.sve.issueReportLink(submission.id, blob, profile?.key ?? '', profile?.name ?? '');
      const link = `${window.location.origin}/sve-report/${token}`;
      const body = `Site Visit Experience report ready for ${siteVisit.name} (${siteVisit.visitDate}). View it: ${link}`;

      const managers = await ds.staff.list().catch(() => []);
      const toManagers = managers.filter((m) => m.role === 'manager' && m.key !== profile?.key);
      if (toManagers.length > 0) {
        ds.notifications.notify(profile?.key ?? '', profile?.name ?? '', toManagers.map((m) => m.key), body, 'sve_report_ready', 'sve_submission', submission.id).catch(() => {});
      }
      const phones = new Set(toManagers.map((m) => m.phone).filter((p): p is string => !!p));
      if (config?.companyPhone) phones.add(config.companyPhone);
      for (const phone of phones) ds.sms.send(phone, body, 'sve_report_ready', profile?.key ?? null).catch(() => {});

      doc.save(sveReportFilename(siteVisit.name));
      return token;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sveVisits'] }),
  });
}
