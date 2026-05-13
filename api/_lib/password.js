// api/_lib/password.js — Password hashing & verification using scrypt
//
// Format: "scrypt$<N>$<saltHex>$<hashHex>"   (N is the scrypt cost parameter)
//
// Stored values that don't match the prefix are treated as legacy plaintext
// to allow seamless migration: verifyPassword still returns true on a
// plaintext match, and the caller is expected to re-hash via hashPassword
// and persist on the next opportunity (typically: successful login).

import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb);

const ALGO        = "scrypt";
const COST        = 16384;          // N = 2^14 — recommended interactive setting
const KEY_LEN     = 32;             // 256-bit derived key
const SALT_BYTES  = 16;

const PREFIX = `${ALGO}$${COST}$`;

export function isHashed(stored) {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

export async function hashPassword(plaintext) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Password must be a non-empty string.");
  }
  const salt = randomBytes(SALT_BYTES);
  const dk   = await scrypt(plaintext, salt, KEY_LEN, { N: COST });
  return `${PREFIX}${salt.toString("hex")}$${dk.toString("hex")}`;
}

// Constant-time string compare via SHA-256 digests — used for legacy
// plaintext fallback. Length differences are masked by hashing first.
function ctEqualString(a, b) {
  const ah = createHash("sha256").update(String(a == null ? "" : a)).digest();
  const bh = createHash("sha256").update(String(b == null ? "" : b)).digest();
  return timingSafeEqual(ah, bh);
}

export async function verifyPassword(stored, attempt) {
  if (typeof stored !== "string" || stored.length === 0) return false;
  if (typeof attempt !== "string") return false;

  if (isHashed(stored)) {
    // Format: scrypt$N$saltHex$hashHex
    const parts = stored.split("$");
    if (parts.length !== 4) return false;
    const N        = Number(parts[1]);
    const saltHex  = parts[2];
    const hashHex  = parts[3];
    if (!Number.isFinite(N) || N < 1024) return false;
    let salt, expected;
    try {
      salt     = Buffer.from(saltHex, "hex");
      expected = Buffer.from(hashHex, "hex");
    } catch { return false; }
    if (expected.length === 0) return false;
    let derived;
    try {
      derived = await scrypt(attempt, salt, expected.length, { N });
    } catch { return false; }
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  // Legacy plaintext fallback — still constant-time.
  return ctEqualString(stored, attempt);
}

// Returns true when the stored value should be re-hashed (e.g. plaintext or
// upgraded to a stronger cost). Callers should re-hash after a successful
// verify and persist the new value.
export function needsRehash(stored) {
  if (typeof stored !== "string" || stored.length === 0) return true;
  if (!isHashed(stored)) return true;
  const parts = stored.split("$");
  if (parts.length !== 4) return true;
  const N = Number(parts[1]);
  return !Number.isFinite(N) || N < COST;
}
