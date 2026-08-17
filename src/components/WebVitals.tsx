"use client";

import { useReportWebVitals } from "next/web-vitals";
import { reportWebVital } from "@/lib/telemetry-client";

type VitalFn = NonNullable<Parameters<typeof useReportWebVitals>[0]>;

const onVital: VitalFn = (metric) => {
  reportWebVital({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    delta: metric.delta,
  });
};

/** Invisible. Production-only vitals via sendBeacon. */
export function WebVitals() {
  useReportWebVitals(onVital);
  return null;
}
