"use client";

import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { useLogDownload } from '../../../shared/hooks/useLogDownload';
import { getDataSource } from '../../../data/source';
import { buildQuotationPdf, quotationFilename, type QuotationClientInfo } from '../lib/quotationPdf';
import { computeLeadQuotationTotals, pricingFor } from '../lib/quotationLogic';
import type { Config, Lead, PlotType } from '../../../types/domain';
import type { QuotationTotals } from '../lib/quotationLogic';

// docs/plans/42-urgent-bug-fixes-oct31.md -- real user ask: a quotation
// request currently sends nothing to the prospect. Mirrors the exact
// established share-link + SMS pattern useSendContractToClient.ts already
// uses for contracts (upload the real PDF, mint a real
// quotation_share_links token via the get-quotation edge function, text a
// real download link) -- but this is an *addition* on top of the existing
// local "Download PDF" behaviour, never a replacement for it: any failure
// in the upload/link/SMS chain is swallowed so the staff member always
// still gets their local PDF.
async function tryShareQuotationWithClient(
  doc: ReturnType<typeof buildQuotationPdf>,
  client: QuotationClientInfo,
  plotType: string,
  paymentPlan: string,
  leadId: string | null,
  createdBy: string | null,
) {
  if (!client.contact) return;
  try {
    const ds = getDataSource();
    const pdfBlob = doc.output('blob') as Blob;
    const storagePath = `${leadId ?? 'walk-in'}/${quotationFilename(client.name)}-${Date.now()}.pdf`;
    const uploadedPath = await ds.quotationPdfs.uploadPdf(storagePath, pdfBlob);
    const token = await ds.quotationShareLinks.create({
      leadId,
      storagePath: uploadedPath,
      clientName: client.name,
      clientContact: client.contact,
      plotType,
      paymentPlan,
      createdBy,
    });
    const link = `${window.location.origin}/quotation/${token}`;
    const firstName = client.name.split(' ')[0] || client.name;
    await ds.sms.send(
      client.contact,
      `Hi ${firstName}, thank you for requesting a quotation from Trulander JSF for a ${plotType} on the ${paymentPlan} plan. A staff member will reach out shortly to explain the payment schedule. Download your quotation here: ${link}`,
      'quotation_ready',
      createdBy,
    );
  } catch {
    // Intentionally non-fatal -- see function comment. The staff member's
    // own local PDF download must never be blocked by this.
  }
}

// Pure client-side render, matching the calculator's own "nothing saved,
// nothing sent" design -- no RPC, no receipt-number-style persisted
// identifier, unlike the payment receipt PDF. The share-link/SMS step
// above is the one real exception, and only runs when the client actually
// has a contact number on file.
export function useDownloadQuotationPdf() {
  const profile = useSessionStore((s) => s.profile);
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async ({ totals, noPlots, plotType, plan, client, config }: { totals: QuotationTotals; noPlots: number; plotType: PlotType; plan: string; client: QuotationClientInfo; config: Config }) => {
      // Real user ask: a Template Settings logo upload that "would
      // replace the current logo" -- config.quoteLogoImage is already a
      // full data URI once uploaded (see useUploadQuoteLogo), so it needs
      // no async load; only the real bundled default does.
      let logo: string | null = config.quoteLogoImage;
      if (!logo) {
        try {
          logo = await loadImageAsDataUri('/trulander-logo.png');
        } catch {
          // Missing/blocked logo shouldn't stop the quotation from generating.
        }
      }
      // noPlots is a full-plot-equivalent count -- buildQuotationPdf needs
      // qty of the SELECTED type instead (see its own comment).
      const qtyOfType = (noPlots || 1) / pricingFor(config, plotType).eq;
      const doc = buildQuotationPdf(totals, qtyOfType, client, config, logo, profile?.name ?? '', profile?.signatureData ?? null);
      const filename = quotationFilename(client.name);
      doc.save(filename);
      logDownload(filename, 'pdf', doc.output('datauristring'));
      await tryShareQuotationWithClient(doc, client, plotType, plan, null, profile?.key ?? null);
    },
  });
}

// Per-lead quotation, for the "Download quotation" row action on My
// Pipeline/Master Pipeline/Company Leads (Master Spec: a lead's real
// negotiated numbers -- unitPrice/discount/netTotal/grandTotal/
// depositTarget overrides, when set -- must win over today's standard
// pricing, exactly what computeLeadQuotationTotals() already does for the
// Contract of Sale PDF). Reuses buildQuotationPdf verbatim rather than a
// second PDF template.
export function useDownloadLeadQuotationPdf() {
  const profile = useSessionStore((s) => s.profile);
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async ({ lead, config }: { lead: Lead; config: Config }) => {
      const totals = computeLeadQuotationTotals(config, lead);
      const client: QuotationClientInfo = { name: lead.name, contact: lead.contact };
      let logo: string | null = config.quoteLogoImage;
      if (!logo) {
        try {
          logo = await loadImageAsDataUri('/trulander-logo.png');
        } catch {
          // Missing/blocked logo shouldn't stop the quotation from generating.
        }
      }
      const qtyOfType = (lead.noPlots || 1) / pricingFor(config, lead.plotType).eq;
      const doc = buildQuotationPdf(totals, qtyOfType, client, config, logo, profile?.name ?? '', profile?.signatureData ?? null);
      const filename = quotationFilename(lead.name);
      doc.save(filename);
      logDownload(filename, 'pdf', doc.output('datauristring'));
    },
  });
}