import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildAttendanceRecordsPdf, attendanceRecordsFilename } from '../lib/attendanceRecordsPdf';
import type { StaffAttendanceSummary } from '../lib/attendanceRecordsLogic';

export function useDownloadAttendanceRecordsPdf() {
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ summaries, startDate, endDate, companyName }: { summaries: StaffAttendanceSummary[]; startDate: string; endDate: string; companyName: string | null | undefined }) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the report from generating.
      }
      const doc = buildAttendanceRecordsPdf(summaries, startDate, endDate, profile?.name ?? 'Management', companyName, logo);
      doc.save(attendanceRecordsFilename(startDate, endDate));
    },
  });
}
