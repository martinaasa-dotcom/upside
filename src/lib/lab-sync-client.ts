import {
  emptyLabBundle,
  type LabBundle,
} from "@/lib/lab-bundle";
import { saveArena } from "@/lib/paper-arena";
import { saveCashflows } from "@/lib/cashflow";
import { saveConvictionMap } from "@/lib/conviction";

export type LabFetchResult = {
  source: "supabase" | "local";
  bundle: LabBundle;
};

/** Mirror Lab pieces into localStorage (offline / demo cache). */
export function mirrorLabLocal(bundle: LabBundle) {
  saveConvictionMap(bundle.conviction ?? {});
  saveCashflows(bundle.cashflows ?? []);
  saveArena(bundle.arena);
}

export async function fetchLabBundle(): Promise<LabFetchResult> {
  try {
    const res = await fetch("/api/lab", { cache: "no-store" });
    if (!res.ok) {
      return { source: "local", bundle: emptyLabBundle() };
    }
    const data = (await res.json()) as {
      source?: string;
      bundle?: LabBundle;
    };
    const bundle = data.bundle ?? emptyLabBundle();
    if (data.source === "supabase") {
      mirrorLabLocal(bundle);
      return { source: "supabase", bundle: { ...bundle, journal: [] } };
    }
  } catch {
    /* fall through */
  }
  return { source: "local", bundle: emptyLabBundle() };
}

export async function pushLabBundle(
  bundle: LabBundle
): Promise<{ ok: boolean; error?: string }> {
  mirrorLabLocal(bundle);
  try {
    const res = await fetch("/api/lab", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conviction: bundle.conviction,
        journal: [],
        cashflows: bundle.cashflows,
        arena: bundle.arena,
        badges: bundle.badges,
      }),
    });
    if (res.status === 400) {
      return { ok: true };
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? `Lab sync failed (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Lab sync failed",
    };
  }
}
