"use client";

import { startOfflineRuntime } from "@/lib/offline/runtime";
import { useEffect } from "react";

/** Registers the shell worker, restores IndexedDB snapshots, flushes the queue. */
export function OfflineRuntime() {
  useEffect(() => startOfflineRuntime(), []);
  return null;
}
