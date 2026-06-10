// GET /api/data — Returns strataPlans (public: summaries) + orders (admin only, requires Bearer token)
import { readData, validToken, extractToken, cors } from "./_lib/store.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const data = await readData();
  // Bearer header only — the long-lived admin token must not appear in query
  // strings (Vercel access logs, browser history, Referer headers).
  const token = extractToken(req);
  const isAdmin = !!(await validToken(token));

  if (isAdmin) {
    return res.status(200).json({ strataPlans: data.strataPlans, orders: data.orders });
  }

  // Public callers get plan SUMMARIES only — the portal's search step needs
  // id/name/address (+ counts for the card meta); the full catalog for one
  // building is fetched on selection via GET /api/plans?id=… . This keeps the
  // startup-blocking payload constant-size instead of growing with every lot
  // of every building, and means lots/products/managerAdminCharge are never
  // exposed to anonymous callers at all. Must stay in sync with server.js.
  const summaries = (data.strataPlans || [])
    .filter(p => p.active !== false)
    .map(p => ({
      id: p.id,
      name: p.name,
      address: p.address || "",
      active: p.active !== false,
      lotCount: (p.lots || []).length,
      ocCount: Object.keys(p.ownerCorps || {}).length,
    }));

  return res.status(200).json({ strataPlans: summaries, orders: [] });
}
