"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type Vault = {
  id: string;
  code: string;
  name: string;
  kind: "bank" | "cash";
  currency: string;
  bank_name: string | null;
  account_last4: string | null;
  custodian_profile_id: string | null;
  active: boolean;
  balance: number;
};
type Journal = {
  id: string;
  kind: "opening" | "bank_to_cash" | "reversal";
  source_vault_id: string | null;
  destination_vault_id: string | null;
  amount: number;
  evidence_reference: string;
  note: string;
  posted_at: string;
  reversal_of: string | null;
};
type Person = { id: string; name: string };

function money(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
}

function validAmount(value: string) {
  return /^\d{1,12}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

function VaultSelect({
  id,
  value,
  onChange,
  vaults,
  kind,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  vaults: Vault[];
  kind?: Vault["kind"];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground"
    >
      <option value="">Choose {kind ?? "vault"}</option>
      {vaults
        .filter((vault) => vault.active && (!kind || vault.kind === kind))
        .map((vault) => (
          <option key={vault.id} value={vault.id}>
            {vault.name} · {vault.code}
          </option>
        ))}
    </select>
  );
}

export function VaultsPanel() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const isManager = profile?.role === "manager";
  const qc = useQueryClient();
  const access = useQuery({
    queryKey: ["finance-vault-access", profile?.key],
    enabled: Boolean(profile),
    queryFn: async () => {
      const sb = requireSupabase();
      // Confirm/refresh the Supabase session before calling a protected RPC.
      // The shell can briefly show a persisted profile while AuthGate checks it.
      const userResult = await sb.auth.getUser();
      if (userResult.error?.name === "AuthSessionMissingError") {
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (userResult.error) throw userResult.error;
      if (!userResult.data.user) throw new Error("Your session has expired. Please sign in again.");
      const accessResult = await sb.rpc("finance_can_view_treasury");
      if (accessResult.error) throw accessResult.error;
      return { allowed: Boolean(accessResult.data), userId: userResult.data.user.id };
    },
  });
  useEffect(() => {
    if (access.error instanceof Error && access.error.message === "Your session has expired. Please sign in again.") {
      useAuthStore.setState({ profile: null });
      router.replace("/auth/v1/login");
    }
  }, [access.error, router]);
  const data = useQuery({
    queryKey: ["finance-vault-register", access.data?.userId],
    enabled: access.data?.allowed === true,
    queryFn: async () => {
      const sb = requireSupabase();
      const [balances, journals, roles, people] = await Promise.all([
        sb.rpc("finance_list_vault_balances"),
        sb
          .from("finance_vault_journals")
          .select("id,kind,source_vault_id,destination_vault_id,amount,evidence_reference,note,posted_at,reversal_of")
          .order("posted_at", { ascending: false })
          .limit(100),
        sb
          .from("finance_role_assignments")
          .select("finance_role")
          .is("revoked_at", null)
          .eq("profile_id", access.data?.userId ?? ""),
        sb.from("profiles").select("id,name").eq("active", true).order("name"),
      ]);
      for (const result of [balances, journals, roles, people]) if (result.error) throw result.error;
      return {
        vaults: (balances.data ?? []) as Vault[],
        journals: (journals.data ?? []) as Journal[],
        canPost: (roles.data ?? []).some((role) => role.finance_role === "finance_head"),
        people: (people.data ?? []) as Person[],
      };
    },
  });
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Vault["kind"]>("bank");
  const [bankName, setBankName] = useState("");
  const [last4, setLast4] = useState("");
  const [custodian, setCustodian] = useState("");
  const [openingVault, setOpeningVault] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingRef, setOpeningRef] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [openingKey, setOpeningKey] = useState(() => crypto.randomUUID());
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferRef, setTransferRef] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferKey, setTransferKey] = useState(() => crypto.randomUUID());
  const [reverseId, setReverseId] = useState("");
  const [reverseRef, setReverseRef] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [reverseKey, setReverseKey] = useState(() => crypto.randomUUID());
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["finance-vault-register"] });
  };
  const createVault = useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().rpc("finance_create_vault", {
        p_code: code.trim().toUpperCase(),
        p_name: name.trim(),
        p_kind: kind,
        p_bank_name: kind === "bank" ? bankName.trim() : null,
        p_account_last4: kind === "bank" ? last4.trim() || null : null,
        p_custodian_profile_id: kind === "cash" ? custodian : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setCode("");
      setName("");
      setBankName("");
      setLast4("");
      setCustodian("");
      setMessage("Vault created with a zero opening balance.");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Vault could not be created."),
  });
  const opening = useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().rpc("finance_record_vault_opening", {
        p_vault_id: openingVault,
        p_amount: openingAmount,
        p_evidence_reference: openingRef.trim(),
        p_note: openingNote.trim(),
        p_idempotency_key: openingKey,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setOpeningAmount("");
      setOpeningRef("");
      setOpeningNote("");
      setOpeningKey(crypto.randomUUID());
      setMessage("Opening recorded in the vault ledger.");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Opening could not be recorded."),
  });
  const transfer = useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().rpc("finance_transfer_bank_to_cash", {
        p_source_id: source,
        p_destination_id: destination,
        p_amount: transferAmount,
        p_evidence_reference: transferRef.trim(),
        p_note: transferNote.trim(),
        p_idempotency_key: transferKey,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setTransferAmount("");
      setTransferRef("");
      setTransferNote("");
      setTransferKey(crypto.randomUUID());
      setMessage("Bank-to-cash movement recorded. Both balances updated together.");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Movement could not be recorded."),
  });
  const reversal = useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().rpc("finance_reverse_vault_journal", {
        p_original_id: reverseId,
        p_evidence_reference: reverseRef.trim(),
        p_note: reverseReason.trim(),
        p_idempotency_key: reverseKey,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setReverseId("");
      setReverseRef("");
      setReverseReason("");
      setReverseKey(crypto.randomUUID());
      setMessage("Reversal posted; the original entry remains in the register.");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Reversal could not be posted."),
  });
  const vaults = data.data?.vaults ?? [];
  const journals = data.data?.journals ?? [];
  const canPost = Boolean(data.data?.canPost);
  const bankTotal = vaults
    .filter((vault) => vault.kind === "bank")
    .reduce((sum, vault) => sum + Number(vault.balance), 0);
  const cashTotal = vaults
    .filter((vault) => vault.kind === "cash")
    .reduce((sum, vault) => sum + Number(vault.balance), 0);
  const vaultName = (id: string | null) => vaults.find((vault) => vault.id === id)?.name ?? "Opening equity";
  const reversedIds = new Set(journals.filter((journal) => journal.reversal_of).map((journal) => journal.reversal_of));
  const openingChanged = () => setOpeningKey(crypto.randomUUID());
  const transferChanged = () => setTransferKey(crypto.randomUUID());

  if (access.isLoading || data.isLoading)
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">Loading vault register…</CardContent>
      </Card>
    );
  if (access.isError || data.isError)
    return (
      <Card>
        <CardContent className="py-10 text-sm text-destructive" role="alert">
          Could not load vault register. {access.error?.message ?? data.error?.message}
        </CardContent>
      </Card>
    );
  if (!access.data?.allowed)
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          Vaults are visible to Management and assigned Finance readers only.
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Vaults</h2>
        <p className="text-sm text-muted-foreground">
          Recorded bank and cash balances. Existing client payments and expenses have not been imported or reconciled
          into this ledger.
        </p>
      </div>
      {message && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm">
          {message}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Bank vaults</CardDescription>
            <CardTitle>{money(bankTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Cash vaults</CardDescription>
            <CardTitle>{money(cashTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total recorded funds</CardDescription>
            <CardTitle>{money(bankTotal + cashTotal)}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vault register</CardTitle>
          <CardDescription>
            Opening plus posted movements equals the balance shown here. A bank-to-cash movement changes the split, not
            the total.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {vaults.map((vault) => (
            <div
              key={vault.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {vault.name} <span className="text-muted-foreground">· {vault.code}</span>
                </p>
                <p className="text-muted-foreground">
                  {vault.kind === "bank"
                    ? `${vault.bank_name}${vault.account_last4 ? ` · ending ${vault.account_last4}` : ""}`
                    : `Cash custodian: ${data.data?.people.find((person) => person.id === vault.custodian_profile_id)?.name ?? "Former staff member"}`}
                </p>
              </div>
              <strong>{money(Number(vault.balance))}</strong>
            </div>
          ))}
          {!vaults.length && (
            <p className="py-4 text-sm text-muted-foreground">
              No vaults set up yet. Management can add the first bank and cash vault below.
            </p>
          )}
        </CardContent>
      </Card>
      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add vault</CardTitle>
            <CardDescription>
              Creating a vault starts at zero. Enter the last four bank account digits only; the full number is not
              stored here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="vault-kind">Type</Label>
              <select
                id="vault-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as Vault["kind"])}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="bank">Bank vault</option>
                <option value="cash">Cash vault</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-code">Short code</Label>
              <Input
                id="vault-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={24}
                placeholder="BANK-01"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-name">Vault name</Label>
              <Input
                id="vault-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                placeholder="Operating bank account"
              />
            </div>
            {kind === "bank" ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="vault-bank">Bank name</Label>
                  <Input
                    id="vault-bank"
                    value={bankName}
                    onChange={(event) => setBankName(event.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vault-last4">Account ending (optional)</Label>
                  <Input
                    id="vault-last4"
                    value={last4}
                    onChange={(event) => setLast4(event.target.value)}
                    maxLength={4}
                    inputMode="numeric"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="vault-custodian">Cash custodian</Label>
                <select
                  id="vault-custodian"
                  value={custodian}
                  onChange={(event) => setCustodian(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose active staff</option>
                  {data.data?.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <Button
                disabled={
                  createVault.isPending ||
                  !/^[A-Z0-9_-]{2,24}$/.test(code.trim().toUpperCase()) ||
                  name.trim().length < 3 ||
                  (kind === "bank"
                    ? bankName.trim().length < 2 || (last4.length > 0 && !/^\d{4}$/.test(last4))
                    : !custodian)
                }
                onClick={() => createVault.mutate()}
              >
                Create vault
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record opening balance</CardTitle>
            <CardDescription>
              Head of Finance records a verified opening with a bank statement or cash-count reference. This is a ledger
              entry, not a bank transaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="vault-opening">Vault</Label>
              <VaultSelect
                id="vault-opening"
                value={openingVault}
                onChange={(value) => {
                  setOpeningVault(value);
                  openingChanged();
                }}
                vaults={vaults}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-opening-amount">Opening amount (GHS)</Label>
              <Input
                id="vault-opening-amount"
                value={openingAmount}
                onChange={(event) => {
                  setOpeningAmount(event.target.value);
                  openingChanged();
                }}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-opening-ref">Statement or count reference</Label>
              <Input
                id="vault-opening-ref"
                value={openingRef}
                onChange={(event) => {
                  setOpeningRef(event.target.value);
                  openingChanged();
                }}
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-opening-note">Note</Label>
              <Input
                id="vault-opening-note"
                value={openingNote}
                onChange={(event) => {
                  setOpeningNote(event.target.value);
                  openingChanged();
                }}
                maxLength={500}
              />
            </div>
            {!canPost && (
              <p className="text-xs text-muted-foreground">
                Assign a Head of Finance in Accounting Settings before posting.
              </p>
            )}
            <Button
              disabled={
                !canPost ||
                opening.isPending ||
                !openingVault ||
                !validAmount(openingAmount) ||
                openingRef.trim().length < 4
              }
              onClick={() => opening.mutate()}
            >
              Post opening
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record bank-to-cash movement</CardTitle>
            <CardDescription>
              Use after the money actually moves. The reference identifies evidence of that movement; the app does not
              initiate a bank transfer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="vault-source">Bank source</Label>
              <VaultSelect
                id="vault-source"
                value={source}
                onChange={(value) => {
                  setSource(value);
                  transferChanged();
                }}
                vaults={vaults}
                kind="bank"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-destination">Cash destination</Label>
              <VaultSelect
                id="vault-destination"
                value={destination}
                onChange={(value) => {
                  setDestination(value);
                  transferChanged();
                }}
                vaults={vaults}
                kind="cash"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-transfer-amount">Amount (GHS)</Label>
              <Input
                id="vault-transfer-amount"
                value={transferAmount}
                onChange={(event) => {
                  setTransferAmount(event.target.value);
                  transferChanged();
                }}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-transfer-ref">Bank withdrawal or cash receipt reference</Label>
              <Input
                id="vault-transfer-ref"
                value={transferRef}
                onChange={(event) => {
                  setTransferRef(event.target.value);
                  transferChanged();
                }}
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-transfer-note">Purpose</Label>
              <Input
                id="vault-transfer-note"
                value={transferNote}
                onChange={(event) => {
                  setTransferNote(event.target.value);
                  transferChanged();
                }}
                maxLength={500}
              />
            </div>
            {!canPost && (
              <p className="text-xs text-muted-foreground">Only the assigned Head of Finance can post a movement.</p>
            )}
            <Button
              disabled={
                !canPost ||
                transfer.isPending ||
                !source ||
                !destination ||
                !validAmount(transferAmount) ||
                transferRef.trim().length < 4
              }
              onClick={() => transfer.mutate()}
            >
              Post movement
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posted movements</CardTitle>
          <CardDescription>
            Every posting has an evidence reference and time. Corrections use a separate reversing entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {journals.map((journal) => (
            <div
              key={journal.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {journal.kind === "opening"
                    ? "Opening balance"
                    : journal.kind === "reversal"
                      ? "Reversal"
                      : "Bank to cash"}{" "}
                  · {money(Number(journal.amount))}
                </p>
                <p className="text-muted-foreground">
                  {vaultName(journal.source_vault_id)} → {vaultName(journal.destination_vault_id)} ·{" "}
                  {journal.evidence_reference}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(journal.posted_at).toLocaleString("en-GB")} {journal.note && `· ${journal.note}`}
                </p>
              </div>
              {canPost && journal.kind !== "reversal" && !reversedIds.has(journal.id) && (
                <Button size="sm" variant="outline" onClick={() => setReverseId(journal.id)}>
                  Reverse
                </Button>
              )}
            </div>
          ))}
          {!journals.length && <p className="py-4 text-sm text-muted-foreground">No movements recorded yet.</p>}
          {reverseId && (
            <div className="space-y-3 rounded-md border p-3">
              <h3 className="font-medium">Reverse selected movement</h3>
              <p className="text-xs text-muted-foreground">
                The original stays in the audit register. This action cannot overdraw a vault.
              </p>
              <div className="space-y-1">
                <Label htmlFor="vault-reversal-ref">Correction evidence reference</Label>
                <Input
                  id="vault-reversal-ref"
                  value={reverseRef}
                  onChange={(event) => {
                    setReverseRef(event.target.value);
                    setReverseKey(crypto.randomUUID());
                  }}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vault-reversal-reason">Reason</Label>
                <Input
                  id="vault-reversal-reason"
                  value={reverseReason}
                  onChange={(event) => {
                    setReverseReason(event.target.value);
                    setReverseKey(crypto.randomUUID());
                  }}
                  maxLength={500}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={reversal.isPending || reverseRef.trim().length < 4 || reverseReason.trim().length < 5}
                  onClick={() => reversal.mutate()}
                >
                  Post reversal
                </Button>
                <Button variant="ghost" onClick={() => setReverseId("")}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
