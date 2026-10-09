import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Adapted from Shreyasmark1/leave-management-system's balance-list.tsx
// (BalanceCard) -- same real progress-bar treatment, simplified to one
// card since Palmstead has a single pooled annual quota, not multiple
// leave types. Replaces the earlier hand-rolled LeaveBalanceRing.
export function LeaveBalanceCard({ total, reserved, remaining, confirmedUsed }: { total: number; reserved: number; remaining: number; confirmedUsed: number }) {
  const usedPercent = total > 0 ? Math.min(100, Math.round((reserved / total) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Annual leave balance</CardTitle>
          <Badge variant="outline">POOLED</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading text-3xl font-semibold">{remaining}</span>
          <span className="text-sm text-muted-foreground">of {total} day(s) left</span>
        </div>
        {total > 0 && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${usedPercent}%` }} />
          </div>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Reserved: {reserved}</span>
          <span>Confirmed used: {confirmedUsed}</span>
        </div>
      </CardContent>
    </Card>
  );
}
