// POST /api/auth/login — Validate credentials, return session token
import { readConfig, createSession, cors, kvGet, kvSet, kvDel, KV_AVAILABLE } from "../_lib/store.js";

const RATE_LIMIT_MAX    = 10;          // max failed attempts before lockout
const RATE_LIMIT_TTL    = 15 * 60;    // lockout window in seconds (15 minutes)

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  // ── Brute-force protection ────────────────────────────────────────────────
  // NOTE: Uses Redis so the counter persists across serverless cold starts.
  // If Redis is unavailable (KV_AVAILABLE is false) rate limiting is skipped
  // gracefully — login still works but without lockout enforcement.
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
  const rateLimitKey = `tocs:login:attempts:${ip}`;

  if (KV_AVAILABLE) {
    try {
      const current = Number(await kvGet(rateLimitKey)) || 0;
      if (current >= RATE_LIMIT_MAX) {
        return res.status(429).json({ error: "Too many login attempts. Please try again in 15 minutes." });
      }
    } catch (err) {
      // Non-fatal: if Redis check fails, allow the request through
      console.error("Rate-limit check error:", err.message);
    }
  }

  try {
    const { user, pass } = req.body || {};
    if (!user || !pass) return res.status(400).json({ error: "Username and password are required." });

    const cfg = await readConfig();

    if (user === cfg.user && pass === cfg.pass) {
      // Successful login — reset the failed-attempt counter
      if (KV_AVAILABLE) {
        try { await kvDel(rateLimitKey); } catch { /* best-effort */ }
      }
      const token = await createSession(user);
      return res.status(200).json({ token, user: cfg.user });
    }

    // Failed login — increment the counter (TTL refreshes the 15-minute window)
    if (KV_AVAILABLE) {
      try {
        const current = Number(await kvGet(rateLimitKey)) || 0;
        await kvSet(rateLimitKey, current + 1, RATE_LIMIT_TTL);
      } catch (err) {
        console.error("Rate-limit increment error:", err.message);
      }
    }

    return res.status(401).json({ error: "Incorrect username or password." });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error: " + (err.message || "Unknown error") });
  }
}
