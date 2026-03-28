// GET /api/orders/export — Download all orders as CSV (admin only)
import { readData, validToken, extractToken, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  // Accept token via Authorization: Bearer header only
  const token = extractToken(req);
  if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

  const { orders } = await readData();

  const rows = [
    ["Order ID","Date","Name","Email","Phone","Building Name","Lot Number","Applicant Type","Owner Name","Company","Delivery Address","Shipping Method","Shipping Cost (AUD)","Items","Total (AUD)","Payment","Status","Manager Admin Charge (AUD)"],
    ...orders.map(o => {
      const ci = o.contactInfo || {};
      const effectiveType = ci.applicantType || (ci.companyName ? "agent" : "owner");
      const sa = ci.shippingAddress;
      const deliveryAddr = sa?.street ? [sa.street, sa.suburb, sa.state, sa.postcode].filter(Boolean).join(", ") : "";
      const adminCharge = (o.items || []).reduce((sum, item) => sum + ((item.managerAdminCharge || 0) * (item.qty || 1)), 0);
      return [
        o.id,
        new Date(o.date).toLocaleDateString("en-AU"),
        ci.name  ?? "",
        ci.email ?? "",
        ci.phone ?? "",
        o.items?.[0]?.planName  ?? "",
        o.items?.[0]?.lotNumber ?? "",
        effectiveType === "agent" ? "Agent" : "Owner",
        ci.ownerName   ?? "",
        ci.companyName ?? "",
        deliveryAddr,
        o.selectedShipping?.name  ?? "",
        (o.selectedShipping?.cost ?? 0).toFixed(2),
        o.items?.length ?? 0,
        (o.total ?? 0).toFixed(2),
        o.payment ?? "",
        o.status  ?? "",
        adminCharge > 0 ? adminCharge.toFixed(2) : "",
      ];
    }),
  ];

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="tocs-orders-${date}.csv"`);
  return res.status(200).send(csv);
}
