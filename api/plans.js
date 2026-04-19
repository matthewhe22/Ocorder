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
    const { planId, lots, ownerCorps: incomingOCs } = body;
    if (!planId || !Array.isArray(lots)) return res.status(400).json({ error: "Invalid import data." });
    if (lots.length === 0) return res.status(400).json({ error: "Import file contains no valid lots. The existing lots were not changed." });

    const data = await readData();
    const idx = data.strataPlans.findIndex(p => p.id === planId);
    if (idx === -1) return res.status(404).json({ error: "Plan not found." });

    // ── Validate + merge ownerCorps (non-destructive: add new OCs, keep existing) ─
    if (incomingOCs !== undefined) {
      if (!incomingOCs || typeof incomingOCs !== "object" || Array.isArray(incomingOCs))
        return res.status(400).json({ error: "ownerCorps must be a plain object." });
      for (const [ocId, oc] of Object.entries(incomingOCs)) {
        if (!ocId || typeof ocId !== "string")
          return res.status(400).json({ error: "Each ownerCorps key must be a non-empty string." });
        if (!oc || typeof oc !== "object" || !oc.name || typeof oc.name !== "string")
          return res.status(400).json({ error: `ownerCorps entry '${ocId}' must have a name string.` });
      }
      const existing = data.strataPlans[idx].ownerCorps || {};
      for (const [id, oc] of Object.entries(incomingOCs)) {
        if (!existing[id]) existing[id] = oc;
      }
      data.strataPlans[idx].ownerCorps = existing;
    }

    // ── Merge lots (non-destructive: update existing by lot number, add new) ────
    const VALID_TYPES = ["Residential", "Commercial", "Parking"];
    const existingLots = data.strataPlans[idx].lots || [];
    const norm = s => String(s || "").trim().toLowerCase();
    let added = 0, updated = 0;

    for (const incoming of lots) {
      if (!incoming.number) continue;
      const existIdx = existingLots.findIndex(el => norm(el.number) === norm(incoming.number));
      if (existIdx >= 0) {
        // Update mutable fields; preserve id, piqLotId, unitNumber
        if (VALID_TYPES.includes(incoming.type)) existingLots[existIdx].type = incoming.type;
        if (incoming.ownerCorps?.length) existingLots[existIdx].ownerCorps = incoming.ownerCorps;
        updated++;
      } else {
        existingLots.push({
          ...incoming,
          type: VALID_TYPES.includes(incoming.type) ? incoming.type : "Residential",
        });
        added++;
      }
    }

    data.strataPlans[idx].lots = existingLots;
    console.log(`[plans] import-lots: Plan ${planId}: +${added} new, ${updated} updated (total ${existingLots.length})`);
    await writeData(data);
    return res.status(200).json({ ok: true, count: existingLots.length, added, updated });
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

  // Back-fill piqLotId on keys/invoice orders that were placed before the PIQ
  // sync ran (so the lot had no piqLotId at order-creation time).  Match by
  // lot number (case-insensitive) or internal lot id within the same plan.
  // Normalise: strip common prefixes ("Lot ", "Unit ", "Apt ") so "Lot 5" === "5"
  const norm = s => String(s || "").trim().toLowerCase().replace(/^(lot|unit|apt|apartment)\s+/i, "").trim();
  let backfilled = 0;
  for (const order of (data.orders || [])) {
    if (order.piqLotId || order.orderCategory !== "keys" || order.payment !== "invoice") continue;
    const lotNumber = order.items?.[0]?.lotNumber || "";
    const lotId     = order.items?.[0]?.lotId     || "";
    const planId    = order.items?.[0]?.planId    || "";
    const plan      = plans.find(p => p.id === planId);
    if (!plan) continue;
    const lots    = plan.lots || [];
    const matches = l =>
      (lotNumber && norm(l.number) === norm(lotNumber)) ||
      (lotId     && l.id === lotId);
    // Prefer lots that already have piqLotId (avoids the un-linked duplicate lot)
    const lot = lots.find(l => l.piqLotId && matches(l)) ?? lots.find(matches);
    if (lot?.piqLotId) {
      order.piqLotId = lot.piqLotId;
      if (order.items?.[0]) order.items[0].lotId = lot.id;
      order.auditLog = [...(order.auditLog || []), {
        ts: new Date().toISOString(),
        action: "PIQ lot linked",
        note: `piqLotId ${lot.piqLotId} back-filled after plan sync`,
      }];
      backfilled++;
    }
  }

  await writeData(data);
  return res.status(200).json({ ok: true, ...(backfilled > 0 ? { backfilled } : {}) });
}
