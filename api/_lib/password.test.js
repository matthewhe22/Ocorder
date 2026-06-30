import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isHashed, needsRehash } from "./password.js";

describe("password helper", () => {
  it("hashPassword produces a scrypt$N$salt$hash string", async () => {
    const h = await hashPassword("hunter2hunter2");
    expect(isHashed(h)).toBe(true);
    expect(h.split("$")).toHaveLength(4);
  });

  it("verifyPassword accepts the correct password", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
  });

  it("verifyPassword rejects the wrong password", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });

  it("two hashes of the same password use different salts", async () => {
    const a = await hashPassword("samePass1234");
    const b = await hashPassword("samePass1234");
    expect(a).not.toEqual(b);
    expect(await verifyPassword(a, "samePass1234")).toBe(true);
    expect(await verifyPassword(b, "samePass1234")).toBe(true);
  });

  it("verifyPassword falls back to legacy plaintext compare", async () => {
    expect(await verifyPassword("Tocs@Vote", "Tocs@Vote")).toBe(true);
    expect(await verifyPassword("Tocs@Vote", "wrong")).toBe(false);
  });

  it("needsRehash flags plaintext and unhashed values", () => {
    expect(needsRehash("plaintext")).toBe(true);
    expect(needsRehash("")).toBe(true);
    expect(needsRehash(undefined)).toBe(true);
  });

  it("needsRehash returns false for current scrypt hashes", async () => {
    const h = await hashPassword("freshPass1234");
    expect(needsRehash(h)).toBe(false);
  });

  it("verifyPassword rejects malformed hashes", async () => {
    expect(await verifyPassword("scrypt$16384$nothex$alsonothex", "anything")).toBe(false);
    expect(await verifyPassword("scrypt$16384$ab$cd$ef", "anything")).toBe(false);
  });

  it("verifyPassword handles null/undefined safely", async () => {
    expect(await verifyPassword(null, "x")).toBe(false);
    expect(await verifyPassword("", "x")).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
});
