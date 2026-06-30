// GET /api/orders/export — Download all orders as a formatted Excel file (admin only)
import { readData, readConfig, validToken, extractToken, cors } from "../_lib/store.js";
import { generateOrderListExcel } from "../_lib/excel.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const token = extractToken(req);
  if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

  const [{ orders }, cfg] = await Promise.all([readData(), readConfig()]);

  const xlsBuf = await generateOrderListExcel(orders, cfg);
  const date   = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="tocs-orders-${date}.xlsx"`);
  return res.status(200).send(xlsBuf);
}
