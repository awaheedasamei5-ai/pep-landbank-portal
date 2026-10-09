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
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
