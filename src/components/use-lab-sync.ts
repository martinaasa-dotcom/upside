"use client";

import { emptyLabBundle, type LabBundle } from "@/lib/lab-bundle";
import { loadConvictionMap } from "@/lib/conviction";
import {
  fetchLabBundle,
  mirrorLabLocal,
  pushLabBundle,
} from "@/lib/lab-sync-client";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useRef, useState } from "react";

/** Conviction is the only Lab field that round-trips to Supabase. */
export function useLabSync() {
  const { push: toast } = useToast();
  const [labBundle, setLabBundle] = useState<LabBundle>(() => emptyLabBundle());
  const [labReady, setLabReady] = useState(false);
  const labDirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local: LabBundle = { conviction: loadConvictionMap() };
      const remote = await fetchLabBundle();
      if (cancelled) return;
      if (remote.source === "supabase") {
        const remoteEmpty =
          Object.keys(remote.bundle.conviction ?? {}).length === 0;
        const localHas = Object.keys(local.conviction ?? {}).length > 0;
        if (remoteEmpty && localHas) {
          setLabBundle(local);
          labDirtyRef.current = true;
        } else {
          const merged: LabBundle = {
            conviction: remoteEmpty
              ? local.conviction
              : remote.bundle.conviction,
            updatedAt: remote.bundle.updatedAt,
          };
          setLabBundle(merged);
          mirrorLabLocal(merged);
        }
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
