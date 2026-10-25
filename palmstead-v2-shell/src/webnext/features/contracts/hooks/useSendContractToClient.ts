import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildContractOfSalePdf, contractFilename } from '../lib/contractPdf';
import type { Lead } from '../../../types/domain';

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.6/Phase F
// -- the real, new end-to-end action the brief asked for by name: "the
// contract should come to the client's dedicated page... and an SMS
// should be sent to the client with a link to download their contract of
// sale." Reuses the exact same v1-parity PDF build useGenerateContract()
// already uses for a lead with no custom template (the common case for a
// Company Leads client) -- this hook only adds what didn't exist before:
// uploading that PDF (instead of only downloading it locally), a real
// public contract_share_links token, and the SMS, through the already-
// live Arkesel sms.send().
export function useSendContractToClient() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ lead, contractRequestId }: { lead: Lead; contractRequestId: string | null }) => {
      if (!config) throw new Error('Config not loaded yet');
      if (!profile) throw new Error('Not signed in');

      let cover: string | null = null;
      let wordmark: string | null = null;
      try {
        cover = config.contractCoverImage || (await loadImageAsDataUri('/contract-cover.jpg'));
      } catch {
        // Missing cover image shouldn't stop the contract from generating.
      }
      try {
        wordmark = config.contractWordmarkImage || (await loadImageAsDataUri('/trulander-wordmark.png'));
      } catch {
        // Missing wordmark shouldn't stop the contract from generating.
      }

      const doc = buildContractOfSalePdf(lead, config, cover, wordmark);
      const pdfBlob = doc.output('blob') as Blob;

      const ds = getDataSource(demoMode);
      const storagePath = `${lead.id}/${contractFilename(lead.name)}-${Date.now()}.pdf`;
      const uploadedPath = await ds.contractGenerations.uploadPdf(storagePath, pdfBlob);
      const contract = await ds.contracts.create(lead.id, lead.name, lead.agent, profile.key, profile.name);
      const token = await ds.contractShareLinks.create({
        contractGenerationId: null,
        contractId: contract.id,
        leadId: lead.id,
        storagePath: uploadedPath,
        createdBy: profile.key,
      });
      const link = `${window.location.origin}/contract/${token}`;

      if (contractRequestId) {
        await ds.contractRequests.markGenerated(contractRequestId, null);
      }

      const smsOk = await ds.sms.send(
        lead.contact,
        `Hi ${lead.name.split(' ')[0] || lead.name}, your Contract of Sale is ready. Download it here: ${link}`,
        'contract_ready',
        profile.key,
      );

      // docs/plans/30-master-system-audit-and-unification-plan.md Phase 10 --
      // every other money-adjacent action (allocation requests, payments)
      // echoes to Management; this one only ever notified the client. Same
      // real pattern as useAllocationRequests.ts: manager-role profile
      // phones plus app_config.company_phone (Management's real number,
      // since production has no manager-role profile with a phone),
      // deduped, alongside an in-app notification.
      const managers = await ds.staff.list().catch(() => []);
      const toManagers = managers.filter((m) => m.role === 'manager');
      if (toManagers.length > 0) {
        ds.notifications
          .notify(profile.key, profile.name, toManagers.map((m) => m.key), `${profile.name} sent ${lead.name}'s Contract of Sale.`, 'contract_sent', 'contract', contract.id)
          .catch(() => {});
      }
      const managerPhones = new Set(toManagers.map((m) => m.phone).filter((p): p is string => !!p));
      if (config.companyPhone) managerPhones.add(config.companyPhone);
      for (const phone of managerPhones) {
        ds.sms.send(phone, `${profile.name} sent ${lead.name}'s Contract of Sale.`, 'contract_sent', profile.key).catch(() => {});
      }

      return { token, link, smsOk };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contractRequests'] });
    },
  });
}
