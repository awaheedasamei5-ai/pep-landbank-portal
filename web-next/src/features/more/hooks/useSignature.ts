import { useMutation } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { readSignatureFile } from '../../../shared/lib/signatureImage';

// Uploads (or clears, when file is null) the signed-in staff member's own
// saved signature, then updates the session store immediately so any
// document generated right after reflects it without a reload -- see
// getStaffSignature()/pdfStampSignature() call sites across Receipt/
// Quotation/Leave for what reads this back.
export function useUpdateSignature() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const setProfile = useSessionStore((s) => s.setProfile);
  return useMutation({
    mutationFn: async (file: File | null) => {
      if (!profile) throw new Error('Not signed in');
      const dataUrl = file ? await readSignatureFile(file) : null;
      await getDataSource(demoMode).staff.updateSignature(profile.key, dataUrl);
      return dataUrl;
    },
    onSuccess: (dataUrl) => setProfile({ signatureData: dataUrl }),
  });
}
