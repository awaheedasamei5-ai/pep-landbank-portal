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
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <span className="font-heading text-3xl font-semibold">{value}</span>
        {Icon && <Icon className="ml-auto size-5 text-muted-foreground" />}
      </CardContent>
    </Card>
  );
}
