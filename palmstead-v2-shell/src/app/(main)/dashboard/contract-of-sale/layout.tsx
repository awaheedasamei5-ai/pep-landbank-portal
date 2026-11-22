"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const ROOT = "/dashboard/contract-of-sale";

export default function ContractPagesLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/\/$/, "");
  if (path === ROOT) return children;

  let parent = ROOT;
  let label = "Back to Contract of Sale";
  if (/^\/dashboard\/contract-of-sale\/templates\/[^/]+\/preview$/.test(path)) {
    parent = path.replace(/\/preview$/, "");
    label = "Back to template";
  } else if (/^\/dashboard\/contract-of-sale\/templates\/[^/]+$/.test(path)) {
    parent = `${ROOT}/templates`;
    label = "Back to templates";
  } else if (/^\/dashboard\/contract-of-sale\/clauses\/[^/]+$/.test(path)) {
    parent = `${ROOT}/clauses`;
    label = "Back to clause library";
  }

  return (
    <div>
      <Link href={parent} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {label}
      </Link>
      {children}
    </div>
  );
}

