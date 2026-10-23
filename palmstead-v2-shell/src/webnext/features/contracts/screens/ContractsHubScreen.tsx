"use client";

import Link from "next/link";
import { ArrowRight, FileCheck2, FilePlus2, FileText, Inbox, Layers, PenTool, Vault as VaultIcon, FileBarChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useContractRequests, useCanFulfilContracts } from "../hooks/useContractRequests";
import { useContractTemplates } from "../hooks/useContractTemplates";
import { useContractDrafts } from "../hooks/useContractDrafts";

const NAV: { href: string; title: string; description: string; icon: typeof FileText; managerOnly?: boolean }[] = [
  { href: "/dashboard/contract-of-sale/generate", title: "Generate", description: "Search a client, capture KYC, generate the branded PDF.", icon: FileText },
  { href: "/dashboard/contract-of-sale/drafts", title: "Drafts", description: "Resume a contract you started but haven't generated yet.", icon: FilePlus2 },
  { href: "/dashboard/contract-of-sale/requests", title: "Requests", description: "The real request/fulfil queue — any staff can ask, Management fulfils.", icon: Inbox },
  { href: "/dashboard/contract-of-sale/vault", title: "Vault", description: "Every contract ever issued, with its real stored PDF.", icon: VaultIcon },
  { href: "/dashboard/contract-of-sale/templates", title: "Templates", description: "Template Studio — draft, version, publish.", icon: Layers, managerOnly: true },
  { href: "/dashboard/contract-of-sale/clauses", title: "Clause library", description: "Reusable clauses, organized by real clause group.", icon: FileCheck2, managerOnly: true },
  { href: "/dashboard/contract-of-sale/style", title: "Style & text", description: "Fonts, typography and branding for the generated PDF.", icon: PenTool, managerOnly: true },
  { href: "/dashboard/contract-of-sale/reports", title: "Reports", description: "Production, outstanding, turnaround and more — on demand.", icon: FileBarChart, managerOnly: true },
];

export function ContractsHubScreen() {
  const profile = useSessionStore((s) => s.profile);
  const canManage = useCanFulfilContracts();
  const { data: requests } = useContractRequests();
  const { data: templates } = useContractTemplates();
  const { data: drafts } = useContractDrafts();

  const pending = (requests ?? []).filter((r) => r.status === "pending").length;
  const myDrafts = (drafts ?? []).filter((d) => d.createdBy === profile?.key).length;
  const publishedTemplates = (templates ?? []).filter((t) => t.isActive).length;

  return (
    <div>
      <PageHeader title="Contract of Sale" description="Every feature of the Contract of Sale workflow, as its own page." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Pending requests" value={pending} icon={Inbox} />
        <StatCard label="My drafts" value={myDrafts} icon={FilePlus2} />
        <StatCard label="Active templates" value={publishedTemplates} icon={Layers} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {NAV.filter((n) => !n.managerOnly || canManage).map((n) => {
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-4.5" />
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <CardTitle className="mt-2">{n.title}</CardTitle>
                  <CardDescription>{n.description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
