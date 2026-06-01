// GET /api/data — Returns strataPlans (public) + orders (admin only, requires Bearer token)
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

  // `managerAdminCharge` is an internal admin-only figure (used on invoices /
  // CSV export, never shown to applicants). Strip it from the public catalog so
  // it isn't exposed to anonymous callers. Build new objects rather than
  // deleting in place — readData() may hand back a shared default reference.
  const publicPlans = (data.strataPlans || []).map(p => ({
    ...p,
    products: (p.products || []).map(({ managerAdminCharge: _omit, ...rest }) => rest),
  }));

  return res.status(200).json({
    strataPlans: isAdmin ? data.strataPlans : publicPlans,
    orders: isAdmin ? data.orders : [],
  });
}
