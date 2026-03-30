// test/nodemailer-mock.js — Intercepts sendMail calls without hitting a real SMTP server.
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
