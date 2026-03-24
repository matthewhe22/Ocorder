// GET /api/config/public — Public config (payment details) for checkout flow
import { readConfig, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const cfg = await readConfig();
  const pd = cfg.paymentDetails || {};
  const pm = cfg.paymentMethods || {};
  return res.status(200).json({
    logo: cfg.logo || "",
    stripeEnabled: !!(cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY),
    bankEnabled:   pm.bankEnabled  !== false,
    payidEnabled:  pm.payidEnabled !== false,
    paymentDetails: {
      accountName: pd.accountName || "Top Owners Corporation",
      bsb: pd.bsb || "033-065",
      accountNumber: pd.accountNumber || "522011",
      payid: pd.payid || "accounts@tocs.com.au",
    },
  });
}
