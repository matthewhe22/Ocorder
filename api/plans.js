// POST /api/plans — Plan and lot management (admin only)
// Routes on req.body.action:
//   (none / "save") — replace full strataPlans array
//   "import-lots"   — import lots for a specific plan from parsed Excel data
import { readData, writeData, validToken, extractToken, cors } from "./_lib/store.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const token = extractToken(req);
  if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

  const body = req.body || {};

  // ── Import lots for a plan ────────────────────────────────────────────────
  if (body.action === "import-lots") {
    const { planId, lots } = body;
    if (!planId || !Array.isArray(lots)) return res.status(400).json({ error: "Invalid import data." });
    if (lots.length === 0) return res.status(400).json({ error: "Import file contains no valid lots. The existing lots were not changed." });

    const data = await readData();
    const idx = data.strataPlans.findIndex(p => p.id === planId);
    if (idx === -1) return res.status(404).json({ error: "Plan not found." });

    const previousCount = data.strataPlans[idx].lots?.length || 0;
    data.strataPlans[idx].lots = lots;
    console.log(`[plans] import-lots: Plan ${planId}: replaced ${previousCount} lots with ${lots.length} lots`);
    await writeData(data);
    return res.status(200).json({ ok: true, count: lots.length });
  }

  // ── Save / replace full strataPlans array ─────────────────────────────────
  const { plans } = body;
  if (!Array.isArray(plans)) return res.status(400).json({ error: "Invalid plans." });
  if (plans.length === 0) return res.status(400).json({ error: "Cannot save an empty plans list — at least one plan is required." });

  // Validate each plan has required fields and sane product data
  for (const plan of plans) {
    if (!plan.id || typeof plan.id !== "string" || !plan.id.trim())
      return res.status(400).json({ error: "Each plan must have a non-empty string id." });
    if (!plan.name || typeof plan.name !== "string" || !plan.name.trim())
      return res.status(400).json({ error: `Plan "${plan.id}" must have a non-empty name.` });
    for (const prod of (plan.products || [])) {
      if (!prod.id || typeof prod.id !== "string" || !prod.id.trim())
        return res.status(400).json({ error: `Plan "${plan.id}": each product must have a non-empty id.` });
      if (typeof prod.price !== "number" || !isFinite(prod.price) || prod.price < 0)
        return res.status(400).json({ error: `Plan "${plan.id}" product "${prod.id}": price must be a non-negative number.` });
      if (prod.secondaryPrice !== undefined && (typeof prod.secondaryPrice !== "number" || prod.secondaryPrice < 0))
        return res.status(400).json({ error: `Plan "${plan.id}" product "${prod.id}": secondaryPrice must be a non-negative number.` });
      if (prod.externalUrl !== undefined && prod.externalUrl !== "" && !/^https?:\/\/.+/i.test(prod.externalUrl))
        return res.status(400).json({ error: `Plan "${plan.id}" product "${prod.id}": externalUrl must start with http:// or https://.` });
    }
  }

  const data = await readData();
  data.strataPlans = plans;
  await writeData(data);
  return res.status(200).json({ ok: true });
}
