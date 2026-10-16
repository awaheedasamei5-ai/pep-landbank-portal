"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Written only from a browser effect. Survives route unmounts, matching Plane's
// in-memory store lifetime; a full reload starts both this map and MobX afresh.
const observedVersions = new Map<string, string>();

/** Reset changes affect both React Query and Plane's independent MobX stores.
 * A visible reload gate prevents interactions with stale records in either store.
 * No forced reload silently discards an in-progress Staff form.
 */
export function OperationsDataBoundary({ children }: { children: React.ReactNode }) {
  const profileKey = useAuthStore((state) => state.profile?.key);
  const generation = useRef<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "changed" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!profileKey) return;
    const currentProfileKey = profileKey;
    let stopped = false;
    let checking = false;
    let changed = false;
    let resolved = false;
    generation.current = observedVersions.get(profileKey) ?? null;
    setOpened(false);
    setStatus("loading");
    const sb = supabase;
    if (!sb) {
      setStatus("error");
      return;
    }
    const client = sb;
    function accept(value: unknown) {
      if (stopped || changed || typeof value !== "string") return;
      resolved = true;
      if (generation.current && generation.current !== value) {
        changed = true;
        setStatus("changed");
      } else {
        generation.current = value;
        observedVersions.set(currentProfileKey, value);
        setOpened(true);
        setStatus("ready");
      }
    }
    async function check() {
      if (checking || stopped || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const { data, error } = await client
          .from("app_data_versions")
          .select("generation")
          .eq("app_key", "operations")
          .single();
        if (error) throw error;
        accept(data.generation);
      } catch {
        if (!stopped && !resolved && !changed) setStatus("error");
      } finally {
        checking = false;
      }
    }
    const channel = sb
      .channel(`operations-data-version:${profileKey}:${attempt}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_data_versions", filter: "app_key=eq.operations" },
        (payload) => accept(payload.new.generation),
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") void check();
      });
    void check();
    const timer = window.setInterval(() => {
      void check();
    }, 30000);
    const recheck = () => {
      void check();
    };
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
      document.removeEventListener("visibilitychange", recheck);
      void sb.removeChannel(channel);
    };
  }, [profileKey, attempt]);

  const messages = {
    loading: { title: "Opening Operations", description: "Checking that your workspace is up to date…" },
    error: {
      title: "Could not check Operations data",
      description: "Check your connection and try again before opening company work.",
    },
    changed: {
      title: "Operations data was reset or restored",
      description:
        "Management changed the Operations dataset. Reload to open the current records. Any unsaved text on the previous screen will not be saved.",
    },
  };
  return (
    <div className="min-w-0">
      {status !== "ready" && (
        <section
          className="mx-auto max-w-xl space-y-4 rounded-xl border bg-card p-6 text-card-foreground"
          aria-live="polite"
        >
          <h1 className="font-semibold text-xl">{messages[status].title}</h1>
          <p className="text-muted-foreground text-sm">{messages[status].description}</p>
          <div className="flex flex-wrap gap-2">
            {status === "changed" && <Button onClick={() => window.location.reload()}>Reload Operations</Button>}
            {status === "error" && <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>}
            <Button variant="outline" asChild>
              <Link href="/dashboard/default">Back to dashboard</Link>
            </Button>
          </div>
        </section>
      )}
      {/* Keep already opened forms mounted until the user chooses to reload.
        Hidden/inert prevents stale actions without immediately destroying state. */}
      <div hidden={status !== "ready"} inert={status !== "ready"} className="min-w-0">
        {opened ? children : null}
      </div>
    </div>
  );
}
