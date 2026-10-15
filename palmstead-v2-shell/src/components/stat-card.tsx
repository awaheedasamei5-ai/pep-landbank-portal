import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Ported verbatim from Shreyasmark1/leave-management-system
// (src/components/stat-card.tsx).
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
}

export function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <span className="min-w-0 break-words font-heading font-semibold text-3xl tabular-nums">{value}</span>
        {Icon && <Icon className="ml-auto size-5 shrink-0 text-muted-foreground" />}
      </CardContent>
    </Card>
  );
}
