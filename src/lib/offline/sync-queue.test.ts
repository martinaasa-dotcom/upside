import { describe, expect, it } from "vitest";
import {
  coalesceKey,
  isQueueableRequest,
  queueablePath,
} from "@/lib/offline/sync-queue";

describe("offline sync queue", () => {
  it("queues preference and draft endpoints only", () => {
    expect(isQueueableRequest("/api/account/experience-tier", "POST")).toBe(
      true
    );
    expect(isQueueableRequest("/api/account/morning-note", "POST")).toBe(true);
    expect(isQueueableRequest("/api/lab", "PUT")).toBe(true);
    expect(isQueueableRequest("/api/feedback", "POST")).toBe(true);
    expect(isQueueableRequest("/api/holdings", "POST")).toBe(false);
    expect(isQueueableRequest("/api/portfolios", "PATCH")).toBe(false);
    expect(isQueueableRequest("/api/lab", "GET")).toBe(false);
  });

  it("strips origin and query from the path", () => {
    expect(
      queueablePath("https://upsidelab.app/api/lab?x=1")
    ).toBe("/api/lab");
    expect(queueablePath("/api/feedback")).toBe("/api/feedback");
    expect(queueablePath("/api/holdings")).toBeNull();
  });

  it("coalesces preferences and keeps each feedback draft", () => {
    expect(
      coalesceKey({
        kind: "preference",
        url: "/api/account/experience-tier",
        method: "POST",
      })
    ).toBe("preference:POST:/api/account/experience-tier");
    expect(
      coalesceKey({
        kind: "draft",
        url: "/api/feedback",
        method: "POST",
      })
    ).toBeNull();
  });
});
