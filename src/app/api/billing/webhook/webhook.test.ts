/**
 * The Stripe webhook. Stripe retries a non-2xx for up to three days -- that
 * retry is the safety net under every subscription state this product has,
 * and acknowledging an event we failed to apply is how you throw it away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let updateError: { message: string } | null = null;
let updateCount: number | null = 1;
let constructed: unknown = null;
const retrieved: string[] = [];

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    stripeWebhookSecret: () => "whsec_test",
    getStripe: () => ({
      webhooks: {
        constructEvent: () => {
          if (constructed === null) throw new Error("No signatures found");
          return constructed;
        },
      },
      subscriptions: {
        retrieve: async (id: string) => {
          retrieved.push(id);
          return {
            id,
            status: "active",
            items: {
              data: [
                {
                  price: { nickname: "Pro", lookup_key: null },
                  current_period_end: 1800000000,
                },
              ],
            },
          };
        },
      },
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => ({
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: updateError, count: updateCount }),
      }),
    }),
  }),
}));

vi.mock("@/lib/telemetry", () => ({ logEvent: () => {} }));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: Request) => Promise<Response>) => h,
}));

import { POST } from "@/app/api/billing/webhook/route";

function post(): Promise<Response> {
  return POST(
    new Request("https://upsidelab.app/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      body: "{}",
    })
  ) as Promise<Response>;
}

const CHECKOUT_COMPLETED = {
  type: "checkout.session.completed",
  data: { object: { customer: "cus_1", subscription: "sub_1" } },
};

beforeEach(() => {
  updateError = null;
  updateCount = 1;
  retrieved.length = 0;
  constructed = CHECKOUT_COMPLETED;
});

describe("billing webhook", () => {
  it("acknowledges an event it actually applied", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("asks Stripe to retry when the database write fails", async () => {
    // The regression this guards: a 200 here tells Stripe the subscription
    // was recorded when it was not, and the retry never comes. The person
    // has been charged and can see no sign of it.
    updateError = { message: "connection terminated unexpectedly" };

    const res = await post();

    expect(res.status).toBe(500);
  });

  it("asks Stripe to retry when the update matched no profile", async () => {
    /*
     * PostgREST does not treat "changed nothing" as an error, so without a
     * row count this is indistinguishable from a successful write -- a
     * payment recorded against a customer id no profile carries would look
     * perfectly handled.
     */
    updateError = null;
    updateCount = 0;

    const res = await post();

    expect(res.status).toBe(500);
  });

  it("re-fetches the subscription rather than trusting the event body", async () => {
    // Stripe does not guarantee delivery order, so the snapshot inside an
    // event can be older than one already applied. Re-fetching by id makes
    // every event for a subscription converge on the same write.
    constructed = {
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } },
    };

    const res = await post();

    expect(res.status).toBe(200);
    expect(retrieved).toEqual(["sub_1"]);
  });

  it("rejects a bad signature without touching the database", async () => {
    constructed = null;
    const res = await post();
    expect(res.status).toBe(400);
  });

  it("acknowledges an event type it does not handle", async () => {
    // Anything else must be a clean 200, or Stripe retries it forever.
    constructed = { type: "invoice.paid", data: { object: {} } };
    const res = await post();
    expect(res.status).toBe(200);
  });
});
