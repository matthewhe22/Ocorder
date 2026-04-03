// test/stripe-mock.js
// Stubs the Stripe SDK so unit/integration tests never make real API calls.
//
// Usage:
//   import { mockStripe } from "../../test/stripe-mock.js";
//   mockStripe({ sessionUrl: "https://checkout.stripe.com/test", paymentStatus: "paid" });

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
