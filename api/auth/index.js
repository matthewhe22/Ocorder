// POST /api/auth — Login and admin user management
// Routes on req.body.action:
//   "login"              — validate credentials, return session token
//   "list-admins"        — return list of admins (no passwords)
//   "add-admin"          — add a new admin user
//   "remove-admin"       — remove an admin by id (cannot remove last)
//   "change-credentials" — update own username/password
import { readConfig, writeConfig, createSession, validToken, extractToken,
         invalidateAllSessions, cors, kvGet, kvSet, kvDel, KV_AVAILABLE } from "../_lib/store.js";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_TTL = 15 * 60; // seconds

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

// Decode token payload without re-validating (call only after validToken succeeds).
function decodeToken(token) {
  try {
    const [payload] = token.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch { return null; }
}

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
      const admins = getAdmins(cfg);
      const match = admins.find(a => a.username === user && a.password === pass);

      if (match) {
        if (KV_AVAILABLE) {
          try { await kvDel(rateLimitKey); } catch { /* best-effort */ }
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
      console.error("Login error:", err);
      return res.status(500).json({ error: "Server error: " + (err.message || "Unknown error") });
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
      password,
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
    // Keep legacy fields in sync with first remaining admin
    cfg.user = cfg.admins[0].username;
    cfg.pass = cfg.admins[0].password;

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

    admins[idx] = { ...admins[idx], password: newPassword };
    cfg.admins = admins;
    cfg.user = cfg.admins[0].username;
    cfg.pass = cfg.admins[0].password;

    await writeConfig(cfg);
    return res.status(200).json({ ok: true });
  }

  // ── POST action=change-credentials ────────────────────────────────────────
  if (action === "change-credentials") {
    const token = extractToken(req);
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    const tokenUser = decodeToken(token)?.user;
    const { currentPass, newUser, newPass } = body;

    const cfg = await readConfig();
    const admins = getAdmins(cfg);
    const idx = admins.findIndex(a => a.username === tokenUser);
    if (idx === -1) return res.status(404).json({ error: "Your admin account was not found." });

    if (currentPass !== admins[idx].password) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    if (newPass) {
      if (newPass.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
      admins[idx].password = newPass;
    }
    if (newUser?.trim()) admins[idx].username = newUser.trim();

    cfg.admins = admins;
    // Keep legacy fields in sync with first admin
    cfg.user = cfg.admins[0].username;
    cfg.pass = cfg.admins[0].password;

    await writeConfig(cfg);
    await invalidateAllSessions();
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Missing or invalid action." });
}
