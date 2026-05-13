// POST /api/auth — Login and admin user management
// Routes on req.body.action:
//   "login"              — validate credentials, return session token
//   "list-admins"        — return list of admins (no passwords)
//   "add-admin"          — add a new admin user
//   "remove-admin"       — remove an admin by id (cannot remove last)
//   "change-credentials" — update own username/password
import { readConfig, writeConfig, createSession, validToken, verifyToken, extractToken,
         invalidateAllSessions, cors, kvGet, kvSet, kvDel, clientIp, KV_AVAILABLE } from "../_lib/store.js";
import { hashPassword, verifyPassword, needsRehash } from "../_lib/password.js";
import { createHash, timingSafeEqual } from "crypto";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_TTL = 15 * 60; // seconds

// Constant-time string comparison via SHA-256 digests — prevents timing
// attacks on credential validation. Length differences are masked because
// both inputs are hashed to a fixed 32-byte digest before comparison.
function constantTimeStrEqual(a, b) {
  const ah = createHash("sha256").update(String(a == null ? "" : a)).digest();
  const bh = createHash("sha256").update(String(b == null ? "" : b)).digest();
  return timingSafeEqual(ah, bh);
}

// Returns the admins array from cfg, migrating from legacy single-user format if needed.
function getAdmins(cfg) {
  if (Array.isArray(cfg.admins) && cfg.admins.length > 0) return cfg.admins;
  // Migrate legacy cfg.user / cfg.pass into the new format
  return [{
    id: "legacy",
    username: cfg.user || "admin",
    password: cfg.pass || "",
    name: "Admin",
  }];
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const body = req.body || {};
  const { action } = body;

  // ── POST action=login ──────────────────────────────────────────────────────
  if (action === "login") {
    // Use the shared, XFF-spoofing-resistant clientIp helper. The previous
    // inline `xff.split(",")[0]` took the *client-supplied* leftmost entry on
    // Vercel and let an attacker defeat the 15-min brute-force lockout by
    // rotating the header per request.
    const ip = clientIp(req);
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
      const admins = getAdmins(cfg);
      // Iterate every admin so the response time does not disclose whether
      // the username or the password was the failing branch. The username
      // match is constant-time; the password verify is run for every admin
      // with a non-empty stored password and the result OR'd into match.
      let match = null;
      const userLower = String(user).toLowerCase();
      for (const a of admins) {
        const userOk = constantTimeStrEqual(String(a.username || "").toLowerCase(), userLower);
        // verifyPassword handles both scrypt-hashed values and legacy plaintext.
        const passOk = await verifyPassword(a.password || "", pass);
        if (userOk && passOk) match = a;
      }

      if (match) {
        if (KV_AVAILABLE) {
          try { await kvDel(rateLimitKey); } catch { /* best-effort */ }
        }

        // Migrate plaintext / weak-cost password to current scrypt hash on
        // successful login. Best-effort: a write failure must not block the
        // login response.
        if (needsRehash(match.password)) {
          try {
            const upgraded = await hashPassword(pass);
            const fresh = await readConfig();
            const freshAdmins = getAdmins(fresh);
            const idx = freshAdmins.findIndex(a => a.id === match.id);
            if (idx !== -1) {
              freshAdmins[idx] = { ...freshAdmins[idx], password: upgraded };
              fresh.admins = freshAdmins;
              // Drop legacy plaintext mirror so it can never be read again.
              delete fresh.pass;
              fresh.user = freshAdmins[0].username;
              await writeConfig(fresh);
              console.log(`[auth] Upgraded admin ${match.username} password to scrypt hash.`);
            }
          } catch (e) {
            console.error("[auth] Password rehash on login failed:", e.message);
          }
        }

        const token = await createSession(match.username);
        return res.status(200).json({ token, user: match.username, name: match.name });
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
      // Log full error server-side; return generic message to avoid leaking
      // stack traces / dependency error text (Stripe, KV, SMTP) to clients.
      console.error("Login error:", err);
      return res.status(500).json({ error: "Internal server error." });
    }
  }

  // ── POST action=list-admins ───────────────────────────────────────────────
  if (action === "list-admins") {
    const token = extractToken(req);
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    const cfg = await readConfig();
    const admins = getAdmins(cfg);
    return res.status(200).json({
      admins: admins.map(({ id, username, name }) => ({ id, username, name })),
    });
  }

  // ── POST action=add-admin ─────────────────────────────────────────────────
  if (action === "add-admin") {
    const token = extractToken(req);
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    const { username, password, name } = body;
    if (!username?.trim()) return res.status(400).json({ error: "Username is required." });
    if (!password) return res.status(400).json({ error: "Password is required." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const cfg = await readConfig();
    const admins = getAdmins(cfg);

    if (admins.find(a => a.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(409).json({ error: "An admin with that username already exists." });
    }

    const newAdmin = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      username: username.trim(),
      password: await hashPassword(password),
      name: name?.trim() || username.trim(),
    };

    cfg.admins = [...admins, newAdmin];
    await writeConfig(cfg);
    return res.status(200).json({
      ok: true,
      admin: { id: newAdmin.id, username: newAdmin.username, name: newAdmin.name },
    });
  }

  // ── POST action=remove-admin ──────────────────────────────────────────────
  if (action === "remove-admin") {
    const token = extractToken(req);
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    const { id } = body;
    const cfg = await readConfig();
    const admins = getAdmins(cfg);

    if (admins.length <= 1) {
      return res.status(409).json({ error: "Cannot remove the last admin account." });
    }
    if (!admins.find(a => a.id === id)) {
      return res.status(404).json({ error: "Admin not found." });
    }

    cfg.admins = admins.filter(a => a.id !== id);
    // Keep legacy username field in sync; never persist plaintext password mirror.
    cfg.user = cfg.admins[0].username;
    delete cfg.pass;

    await writeConfig(cfg);
    return res.status(200).json({ ok: true });
  }

  // ── POST action=reset-admin-password ─────────────────────────────────────
  if (action === "reset-admin-password") {
    const token = extractToken(req);
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    const { id, newPassword } = body;
    if (!id) return res.status(400).json({ error: "Admin ID is required." });
    if (!newPassword) return res.status(400).json({ error: "New password is required." });
    if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const cfg = await readConfig();
    const admins = getAdmins(cfg);
    const idx = admins.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: "Admin not found." });

    admins[idx] = { ...admins[idx], password: await hashPassword(newPassword) };
    cfg.admins = admins;
    cfg.user = cfg.admins[0].username;
    delete cfg.pass;

    await writeConfig(cfg);
    await invalidateAllSessions();
    return res.status(200).json({ ok: true });
  }

  // ── POST action=change-credentials ────────────────────────────────────────
  if (action === "change-credentials") {
    const token = extractToken(req);
    // Use the cryptographically-verified payload — never trust unverified
    // base64. verifyToken returns null for any failure, including stale epoch.
    const verified = await verifyToken(token);
    if (!verified) return res.status(401).json({ error: "Not authenticated." });

    const tokenUser = verified.user;
    const { currentPass, newUser, newPass } = body;

    const cfg = await readConfig();
    const admins = getAdmins(cfg);
    const idx = admins.findIndex(a => a.username === tokenUser);
    if (idx === -1) return res.status(404).json({ error: "Your admin account was not found." });

    if (!(await verifyPassword(admins[idx].password || "", currentPass || ""))) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    if (newPass) {
      if (newPass.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
      if (await verifyPassword(admins[idx].password || "", newPass)) {
        return res.status(400).json({ error: "New password must differ from the current password." });
      }
      admins[idx].password = await hashPassword(newPass);
    }
    if (newUser?.trim()) admins[idx].username = newUser.trim();

    cfg.admins = admins;
    cfg.user = cfg.admins[0].username;
    delete cfg.pass;

    await writeConfig(cfg);
    await invalidateAllSessions();
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Missing or invalid action." });
}
