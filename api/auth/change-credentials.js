// POST /api/auth/change-credentials — Update admin username and/or password
import { readConfig, writeConfig, validToken, extractToken, invalidateAllSessions, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const token = extractToken(req);
  if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

  const { currentPass, newUser, newPass } = req.body || {};
  const cfg = await readConfig();

  if (currentPass !== cfg.pass) return res.status(400).json({ error: "Current password is incorrect." });
  if (newPass) {
    if (newPass.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
    cfg.pass = newPass;
  }
  if (newUser?.trim()) cfg.user = newUser.trim();

  await writeConfig(cfg);
  await invalidateAllSessions(); // Force re-login after credential change
  return res.status(200).json({ ok: true });
}
