// test/nodemailer-mock.js
// Intercepts nodemailer sendMail calls so unit/integration tests never hit a
// real SMTP server.  Call mockNodemailer() at the top of any test file that
// imports (directly or transitively) from nodemailer.
//
// Usage:
//   import { mockNodemailer, sentMail, resetSentMail } from "../../test/nodemailer-mock.js";
//   mockNodemailer();
//   beforeEach(() => resetSentMail());

import { vi } from "vitest";

// Captures all sent mail objects for assertion in tests
export const sentMail = [];

export function resetSentMail() {
  sentMail.length = 0;
}

export function mockNodemailer() {
  vi.mock("nodemailer", () => ({
    default: {
      createTransport: () => ({
        sendMail: vi.fn(async (opts) => {
          sentMail.push(opts);
          return { messageId: "test-id" };
        }),
        verify: vi.fn(async () => true),
      }),
    },
  }));
}
