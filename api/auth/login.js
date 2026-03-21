// POST /api/auth/login — Validate credentials, return session token
import { readConfig, createSession, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const { user, pass } = req.body || {};
    if (!user || !pass) return res.status(400).json({ error: "Username and password are required." });

    const cfg = await readConfig();

    if (user === cfg.user && pass === cfg.pass) {
      const token = await createSession(user);
      return res.status(200).json({ token, user: cfg.user });
    }
    return res.status(401).json({ error: "Incorrect username or password." });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error: " + (err.message || "Unknown error") });
  }
}
