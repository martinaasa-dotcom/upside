import type { ConvictionMap } from "@/lib/conviction";

/** Per-owner Lab state. Conviction is the only field that still exists. */
export type LabBundle = {
  conviction: ConvictionMap;
  updatedAt?: string;
};

export function emptyLabBundle(): LabBundle {
  return { conviction: {} };
}
