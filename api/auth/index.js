// POST /api/auth — Login and credential management (admin)
// Routes on req.body.action:
//   "login"              — validate credentials, return session token
//   "change-credentials" — update username/password (requires current password + valid session)
import { readConfig, writeConfig, createSession, validToken, extractToken,
         invalidateAllSessions, cors, kvGet, kvSet, kvDel, KV_AVAILABLE } from "../_lib/store.js";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_TTL = 15 * 60; // seconds

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const body = req.body || {};
  const { action } = body;

  // ── POST action=login ──────────────────────────────────────────────────────
  if (action === "login") {
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
        console.error("Rate-limit check error:", err.message);
      }
    }

    try {
      const { user, pass } = body;
      if (!user || !pass) return res.status(400).json({ error: "Username and password are required." });

      const cfg = await readConfig();

      if (user === cfg.user && pass === cfg.pass) {
        if (KV_AVAILABLE) {
          try { await kvDel(rateLimitKey); } catch { /* best-effort */ }
        }
        const token = await createSession(user);
        return res.status(200).json({ token, user: cfg.user });
      }

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

  // ── POST action=change-credentials ────────────────────────────────────────
  if (action === "change-credentials") {
    const token = extractToken(req);
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    const { currentPass, newUser, newPass } = body;
    const cfg = await readConfig();

    if (currentPass !== cfg.pass) return res.status(400).json({ error: "Current password is incorrect." });
    if (newPass) {
      if (newPass.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
      cfg.pass = newPass;
    }
    if (newUser?.trim()) cfg.user = newUser.trim();

    await writeConfig(cfg);
    await invalidateAllSessions();
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Missing or invalid action." });
}
