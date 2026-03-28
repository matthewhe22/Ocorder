// GET /api/data — Returns strataPlans (public) + orders (admin only, requires Bearer token)
import { readData, validToken, extractToken, cors } from "./_lib/store.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const data = await readData();
  const token = extractToken(req) || req.query?.token;
  const isAdmin = !!(await validToken(token));

  return res.status(200).json({
    strataPlans: data.strataPlans,
    orders: isAdmin ? data.orders : [],
  });
}
