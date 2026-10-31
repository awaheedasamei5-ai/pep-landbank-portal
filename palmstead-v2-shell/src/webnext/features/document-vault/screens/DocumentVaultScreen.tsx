"use client";

import { useState } from "react";
import { useNavigate } from "react-router";
import { FileText, FileSpreadsheet, File as FileIcon, Download, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/table-empty";
import { PageHeader } from "@/components/page-header";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useDocumentVault } from "../hooks/useDocumentVault";
import type { DownloadRecord } from "../../../types/domain";
import { requireSupabase } from "@/lib/supabase.client";

const KIND_ICON: Record<string, typeof FileText> = { pdf: FileText, excel: FileSpreadsheet, csv: FileSpreadsheet };

function fmtDateTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function dataUriToBlobUrl(dataUri: string): string {
  const comma = dataUri.indexOf(",");
  const header = dataUri.slice(0, comma);
  const b64 = dataUri.slice(comma + 1);
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function redownload(fileData: string, filename: string) {
  const url = dataUriToBlobUrl(fileData);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// docs/plans/20-document-vault-plan.md -- real destination for the
// ported index.html viewDownloads() (index.html:9125-9166). "Every file
// you've generated or downloaded" -- distinct from the Contract-of-Sale
// Vault (that one only covers Contract of Sale PDFs specifically).
export function DocumentVaultScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { data: downloads, isLoading } = useDocumentVault();
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const all = downloads ?? [];
  const kinds = [...new Set(all.map((d) => d.kind))];
  const list = kindFilter ? all.filter((d) => d.kind === kindFilter) : all;

  return (
    <div>
      <PageHeader
        title="Document Vault"
        description={profile?.role === "manager" ? "Every file downloaded by the team." : "Everything you've downloaded from this account."}
      />

      {kinds.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={!kindFilter ? "default" : "outline"} onClick={() => setKindFilter(null)}>
            All
          </Button>
          {kinds.map((k) => (
            <Button key={k} type="button" size="sm" variant={kindFilter === k ? "default" : "outline"} onClick={() => setKindFilter(k)}>
              {k.toUpperCase()}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Kind</TableHead>
                {profile?.role === "manager" && <TableHead>Downloaded by</TableHead>}
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={profile?.role === "manager" ? 5 : 4} message="Loading…" />
              ) : list.length === 0 ? (
                <TableEmpty colSpan={profile?.role === "manager" ? 5 : 4} message="Nothing here yet — PDFs and Excel exports you generate will show up here." />
              ) : (
                list.map((d) => <DownloadRow key={d.id} record={d} showUser={profile?.role === "manager"} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function DownloadRow({ record, showUser }: { record: DownloadRecord; showUser: boolean }) {
  const Icon = KIND_ICON[record.kind] ?? FileIcon;
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      let fileData = record.fileData;
      if (!fileData) {
        // The register omits large file_data values. Fetch only the selected
        // file, with downloads RLS still limiting access to this viewer.
        const { data, error: loadError } = await requireSupabase()
          .from("downloads")
          .select("file_data")
          .eq("id", record.id)
          .single();
        if (loadError) throw loadError;
        fileData = data?.file_data ?? null;
      }
      if (!fileData) throw new Error("This file has no saved copy.");
      redownload(fileData, record.filename);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          {record.filename}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{record.kind.toUpperCase()}</Badge>
      </TableCell>
      {showUser && <TableCell className="text-muted-foreground">{record.userName}</TableCell>}
      <TableCell className="text-muted-foreground">{fmtDateTime(record.createdAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            {record.sourceType === "payment" && record.sourceLeadId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/dashboard/pipeline/${record.sourceLeadId}`)}
              >
                <ExternalLink />
                View source
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" disabled={downloading} onClick={download}>
              <Download />
              {downloading ? "Preparing…" : "Download"}
            </Button>
          </div>
          {error && <span role="alert" className="max-w-48 text-xs text-destructive">{error}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}
