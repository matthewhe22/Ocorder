// test/stripe-mock.js — Stub the Stripe SDK without making real API calls.
import { vi } from "vitest";

export function mockStripe({ sessionUrl = "https://checkout.stripe.com/test", paymentStatus = "paid", metadata = {} } = {}) {
  vi.mock("stripe", () => {
    return {
      default: vi.fn().mockImplementation(() => ({
        checkout: {
          sessions: {
            create: vi.fn(async (params) => ({
              id: "cs_test_123",
              url: sessionUrl,
              metadata: params.metadata || {},
            })),
            retrieve: vi.fn(async (id) => ({
              id,
              payment_status: paymentStatus,
              metadata,
            })),
          },
        },
        accounts: {
          retrieve: vi.fn(async () => ({ id: "acct_test123" })),
        },
      })),
    };
  });
}
