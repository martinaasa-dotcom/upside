import {
  emptyLabBundle,
  type LabBundle,
} from "@/lib/lab-bundle";
import { saveArena } from "@/lib/paper-arena";
import { saveCashflows } from "@/lib/cashflow";
import { saveConvictionMap } from "@/lib/conviction";
import { ownerPinHeaders } from "@/lib/owner-pin-client";

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
      headers: ownerPinHeaders(undefined, {
        "Content-Type": "application/json",
      }),
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

export async function createShareLink(opts?: {
  label?: string;
  scope?: "overview" | "sheet" | "lab";
  portfolioId?: string | null;
  daysValid?: number;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: ownerPinHeaders(undefined, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(opts ?? { scope: "overview", daysValid: 14 }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      path?: string;
      token?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error ?? `Share failed (${res.status})` };
    }
    const path = data.path ?? (data.token ? `/?share=${data.token}` : null);
    if (!path) return { ok: false, error: "No share path returned" };
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${path}`
        : path;
    return { ok: true, url };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Share failed",
    };
  }
}
