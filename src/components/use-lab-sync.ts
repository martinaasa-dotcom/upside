"use client";

import { emptyLabBundle, type LabBundle } from "@/lib/lab-bundle";
import { loadCashflows } from "@/lib/cashflow";
import { loadArena } from "@/lib/paper-arena";
import { loadConvictionMap } from "@/lib/conviction";
import {
  fetchLabBundle,
  mirrorLabLocal,
  pushLabBundle,
} from "@/lib/lab-sync-client";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useRef, useState } from "react";

/**
 * Conviction is the only Lab field that still round-trips to Supabase.
 * Arena / cashflow / badges stay on this device.
 */
export function useLabSync() {
  const { push: toast } = useToast();
  const [labBundle, setLabBundle] = useState<LabBundle>(() => emptyLabBundle());
  const [labReady, setLabReady] = useState(false);
  const labDirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local: LabBundle = {
        conviction: loadConvictionMap(),
        journal: [],
        cashflows: loadCashflows(),
        arena: loadArena(),
        badges: [],
      };
      const remote = await fetchLabBundle();
      if (cancelled) return;
      if (remote.source === "supabase") {
        const merged: LabBundle = {
          ...local,
          conviction:
            Object.keys(remote.bundle.conviction ?? {}).length > 0
              ? remote.bundle.conviction
              : local.conviction,
          journal: [],
        };
        setLabBundle(merged);
        mirrorLabLocal(merged);
      } else {
        setLabBundle(local);
      }
      setLabReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!labReady || !labDirtyRef.current) return;
    const t = window.setTimeout(() => {
      labDirtyRef.current = false;
      void pushLabBundle(labBundle).then((r) => {
        if (!r.ok && r.error) toast(r.error, "error");
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [labBundle, labReady, toast]);

  function patchLab(patch: Partial<LabBundle>) {
    labDirtyRef.current = true;
    setLabBundle((prev) => ({ ...prev, ...patch }));
  }

  return { labBundle, labReady, patchLab };
}
