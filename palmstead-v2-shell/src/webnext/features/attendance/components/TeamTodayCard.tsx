"use client";

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceRecord } from '../../../types/domain';

function statusOf(rec: AttendanceRecord): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (rec.signOutAt) return { label: 'Done for the day', variant: 'secondary' };
  if (rec.signInAt) return { label: 'Signed in', variant: 'default' };
  return { label: 'Not signed in', variant: 'outline' };
}

function timeStr(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Management's real first question ("is anything wrong today, and who
// do I need to deal with") -- Attendance plan Part 4. Rebuilt on the
// shell's real Card/Badge after the 2026-10-08/09 correction.
export function TeamTodayCard({ records, isLoading }: { records: AttendanceRecord[]; isLoading: boolean }) {
  const signedIn = records.filter((r) => r.signInAt).length;
  const lateCount = records.filter((r) => r.lateReason).length;
  const offSiteCount = records.filter((r) => r.isOffSiteIn || r.isOffSiteOut).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Team today</CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline">{signedIn} in</Badge>
            {lateCount > 0 && <Badge variant="destructive">{lateCount} late</Badge>}
            {offSiteCount > 0 && <Badge variant="secondary">{offSiteCount} off-site</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !records.length ? (
          <p className="text-sm text-muted-foreground">Nobody has signed in yet today.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {records.map((rec) => {
              const st = statusOf(rec);
              return (
                <div key={rec.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{rec.staffName ?? rec.staffKey}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {timeStr(rec.signInAt)}
                    {rec.signOutAt && ` — ${timeStr(rec.signOutAt)}`}
                    {rec.lateReason && ' · Late'}
                    {(rec.isOffSiteIn || rec.isOffSiteOut) && ' · Off-site'}
                  </div>
                  {(rec.signInReason || rec.lateReason) && <div className="mt-1 text-xs text-muted-foreground italic">{rec.signInReason || rec.lateReason}</div>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
