"use client";

import { useMutation } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildLeaveLetterPdf, leaveLetterFilename } from '../lib/leaveLetterPdf';
import type { LeaveRequest } from '../../../types/domain';

// Plan Part 3: "they can download the real, formal letter for their own
// records ... without asking anyone to generate it for them." Staff
// signature is looked up fresh (not just the current viewer's own, since
// Management downloading an approved request's letter needs the
// requester's signature, not their own).
export function useDownloadLeaveLetterPdf() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useMutation({
    mutationFn: async (request: LeaveRequest) => {
      const ds = getDataSource(demoMode);
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the letter from generating.
      }
      const staff = await ds.staff.listAll().catch(() => []);
      const staffSignature = staff.find((s) => s.key === request.agentKey)?.signatureData ?? null;
      const doc = buildLeaveLetterPdf(request, staffSignature, logo);
      doc.save(leaveLetterFilename(request));
    },
  });
}
