// Ported verbatim from Shreyasmark1/leave-management-system
// (src/components/page-header.tsx) -- same stack (Next.js + shadcn/ui +
// Tailwind), adopted as the shared page-header pattern per the 2026-10-08
// standing correction: real sourced components, not hand-invented layout.
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground text-sm">{description}</p>}
      </div>
      {action && <div className="min-w-0 max-w-full shrink-0">{action}</div>}
    </div>
  );
}
