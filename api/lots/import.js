// POST /api/lots/import — Import lots from parsed Excel data (admin only)
import { readData, writeData, validToken, extractToken, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const token = extractToken(req);
  if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

  const { planId, lots } = req.body || {};
  if (!planId || !Array.isArray(lots)) return res.status(400).json({ error: "Invalid import data." });

  const data = await readData();
  const idx = data.strataPlans.findIndex(p => p.id === planId);
  if (idx === -1) return res.status(404).json({ error: "Plan not found." });

  data.strataPlans[idx].lots = lots;
  await writeData(data);
  return res.status(200).json({ ok: true, count: lots.length });
}
