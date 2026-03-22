// api/_lib/store.js — Shared helpers for all Vercel serverless functions
// Uses standard Redis (via the 'redis' npm package) for persistence.
//
// ── Redis setup (choose one) ──────────────────────────────────────────────────
// Option A — Upstash Redis (free tier, recommended):
//   1. Create a free database at https://upstash.com
//   2. Copy the "Redis URL"  (starts with rediss://)
//   3. In Vercel dashboard → Project → Settings → Environment Variables:
//      Add  REDIS_URL = rediss://default:<password>@<host>:<port>
//   4. Redeploy
//
// Option B — Vercel KV (requires Vercel Pro/hobby plan):
//   1. Vercel dashboard → Storage → Create Database → KV
//   2. Connect it to your project → Vercel sets KV_URL automatically
//   3. Redeploy
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "redis";

// ── KV key names ──────────────────────────────────────────────────────────────
const DATA_KEY       = "tocs:data";
const CONFIG_KEY     = "tocs:config";

// Detect whether a Redis URL is configured
const REDIS_URL   = process.env.REDIS_URL || process.env.KV_URL;
const KV_AVAILABLE = !!REDIS_URL;

const NO_KV_MSG =
  "No Redis store is connected. " +
  "Set REDIS_URL in your Vercel project's Environment Variables " +
  "(Upstash free tier: https://upstash.com), then redeploy.";

// ── Redis client singleton (reused across warm serverless invocations) ────────
let _client = null;

async function getClient() {
  if (!KV_AVAILABLE) return null;
  if (!_client) {
    // Support both redis:// and rediss:// (TLS) URLs — e.g. Upstash uses rediss://
    const useTLS = REDIS_URL.startsWith("rediss://");
    _client = createClient({
      url: REDIS_URL,
      socket: useTLS ? { tls: true, rejectUnauthorized: false } : undefined,
    });
    _client.on("error", (err) => console.error("Redis error:", err.message));
  }
  if (!_client.isOpen) {
    await _client.connect();
  }
  return _client;
}

// ── Seed data ─────────────────────────────────────────────────────────────────
export const DEFAULT_DATA = {
  strataPlans: [
    {
      id: "SP12345",
      name: "Harbour View Residences",
      address: "45 Marina Drive, Sydney NSW 2000",
      lots: [
        { id:"L1", number:"Lot 1",           level:"Ground",   type:"Residential", ownerCorps:["OC-A"] },
        { id:"L2", number:"Lot 2",           level:"Level 1",  type:"Residential", ownerCorps:["OC-A"] },
        { id:"L3", number:"Lot 3",           level:"Level 2",  type:"Residential", ownerCorps:["OC-A"] },
        { id:"L4", number:"Lot 4",           level:"Level 3",  type:"Residential", ownerCorps:["OC-A","OC-B"] },
        { id:"L5", number:"Lot 5",           level:"Level 4",  type:"Commercial",  ownerCorps:["OC-B"] },
        { id:"L6", number:"Lot 6",           level:"Level 5",  type:"Commercial",  ownerCorps:["OC-B"] },
        { id:"L7", number:"Lot 7 (Parking)", level:"Basement", type:"Parking",     ownerCorps:["OC-A","OC-B"] },
      ],
      ownerCorps: {
        "OC-A": { name:"Owner Corporation A — Residential", levy:1200 },
        "OC-B": { name:"Owner Corporation B — Commercial",  levy:2400 },
      },
      products: [
        { id:"P1", name:"OC Certificate — Standard",         description:"s151 SMA Owner Corporation Certificate",             price:220, secondaryPrice:150, turnaround:"5 business days",   perOC:true,  category:"oc"   },
        { id:"P2", name:"OC Certificate — Urgent",           description:"Priority processing, 24–48 hour turnaround",         price:385, secondaryPrice:280, turnaround:"1–2 business days", perOC:true,  category:"oc"   },
        { id:"P3", name:"Register of Owners Search",         description:"Current register of lot owners and addresses",       price: 55,                    turnaround:"3 business days",   perOC:false, category:"oc"   },
        { id:"P4", name:"Insurance Certificate of Currency", description:"Current building insurance details and certificate", price: 75,                    turnaround:"2 business days",   perOC:false, category:"oc"   },
        { id:"P5", name:"Meeting Minutes — Last 2 Years",    description:"Minutes of AGM and general meetings",               price:110,                    turnaround:"5 business days",   perOC:false, category:"oc"   },
        { id:"P6", name:"Financial Statements",              description:"Latest audited financial statements",                price: 95,                    turnaround:"5 business days",   perOC:false, category:"oc"   },
        { id:"K1", name:"Building Entry Key",               description:"Standard building entry key — price confirmed on invoice",   price:0, turnaround:"2–3 business days", perOC:false, category:"keys" },
        { id:"K2", name:"Car Park Fob",                     description:"Car park access fob/swipe — price confirmed on invoice",     price:0, turnaround:"2–3 business days", perOC:false, category:"keys" },
        { id:"K3", name:"Garage Remote",                    description:"Garage/gate remote control — price confirmed on invoice",    price:0, turnaround:"3–5 business days", perOC:false, category:"keys" },
      ],
      shippingOptions: [
        { id: "ship-std", name: "Standard Post",  cost: 10 },
        { id: "ship-exp", name: "Express Post",   cost: 20 },
      ],
      active: true,
    },
  ],
  orders: [],
};

// ── Default config (used when Redis is empty or unavailable) ──────────────────
export const DEFAULT_CONFIG = {
  user:       process.env.ADMIN_USER  || "info@tocs.co",
  pass:       process.env.ADMIN_PASS  || "Tocs@Vote",
  orderEmail: process.env.ORDER_EMAIL || "Orders@tocs.co",
  logo: "",  // base64 data URL or external URL — set via Admin → Branding
  smtp: {
    host: process.env.SMTP_HOST || "mail-au.smtp2go.com",
    port: Number(process.env.SMTP_PORT) || 2525,
    user: process.env.SMTP_USER || "OCCAPP",
    pass: process.env.SMTP_PASS || "",
  },
  sharepoint: {
    tenantId:     process.env.AZURE_TENANT_ID      || "",
    clientId:     process.env.AZURE_CLIENT_ID      || "",
    clientSecret: process.env.AZURE_CLIENT_SECRET  || "",
    siteId:       process.env.SHAREPOINT_SITE_ID   || "",
    folderPath:   process.env.SHAREPOINT_FOLDER_PATH || "Top Owners Corporation Solutions/ORDER DATABASE",
  },
  paymentDetails: {
    accountName:   "Top Owners Corporation",
    bsb:           "033-065",
    accountNumber: "522011",
    payid:         "accounts@tocs.com.au",
  },
  emailTemplate: {
    certificateSubject:  "Your OC Certificate — Order #{orderId}",
    certificateGreeting: "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team",
    footer: "TOCS Owners Corporation Solution  |  info@tocs.co",
  },
  stripe: {
    secretKey:      "",
    publishableKey: "",
  },
};

// ── Stateless HMAC token helpers ──────────────────────────────────────────────
import { createHmac, timingSafeEqual } from "crypto";

async function getSecret() {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
  try {
    const cfg = await readConfig();
    return cfg.pass || process.env.ADMIN_PASS || "tocs-default-secret-change-me";
  } catch {
    return process.env.ADMIN_PASS || "tocs-default-secret-change-me";
  }
}

async function hmacSign(payload) {
  const secret = await getSecret();
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ── Safe Redis wrapper ────────────────────────────────────────────────────────
async function kvGet(key) {
  if (!KV_AVAILABLE) return null;
  try {
    const client = await getClient();
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.error("Redis GET error:", err.message);
    return null;
  }
}

async function kvSet(key, value) {
  if (!KV_AVAILABLE) {
    throw new Error(NO_KV_MSG);
  }
  try {
    const client = await getClient();
    await client.set(key, JSON.stringify(value));
  } catch (err) {
    throw new Error("Redis write failed: " + err.message);
  }
}

async function kvDel(key) {
  if (!KV_AVAILABLE) return;
  try {
    const client = await getClient();
    await client.del(key);
  } catch { /* best-effort */ }
}

// ── Authority document helpers ────────────────────────────────────────────────
export async function writeAuthority(orderId, doc) {
  await kvSet(`tocs:authority:${orderId}`, doc);
}

export async function readAuthority(orderId) {
  return await kvGet(`tocs:authority:${orderId}`);
}

export { KV_AVAILABLE };

// ── Data helpers ──────────────────────────────────────────────────────────────
export async function readData() {
  const d = await kvGet(DATA_KEY);
  if (!d) return DEFAULT_DATA;

  // One-time migrations for plans stored in Redis before new fields were added.
  let migrated = false;
  // Build O(1) lookup map so migration doesn't do O(n²) searches.
  const storedById = new Map((d.strataPlans || []).map(p => [p.id, p]));
  for (const defPlan of DEFAULT_DATA.strataPlans) {
    const plan = storedById.get(defPlan.id);
    if (!plan) continue;

    // Migrate missing products (e.g. K1/K2/K3 added after initial seed).
    const existingIds = new Set((plan.products || []).map(p => p.id));
    const missing = defPlan.products.filter(p => !existingIds.has(p.id));
    if (missing.length > 0) {
      plan.products = [...(plan.products || []), ...missing];
      migrated = true;
    }

    // Migrate missing shippingOptions field (added 2026-03-20).
    // Inject an empty array so admin can configure options via the UI.
    if (!Array.isArray(plan.shippingOptions)) {
      plan.shippingOptions = [];
      migrated = true;
    }
  }

  // Migrate keysShipping on ALL stored plans (incl. custom plans not in DEFAULT_DATA).
  for (const plan of (d.strataPlans || [])) {
    if (!plan.keysShipping) {
      plan.keysShipping = { deliveryCost: 0, expressCost: 0 };
      migrated = true;
    }
  }

  if (migrated) {
    // Write back so subsequent reads don't need to migrate again
    try { await kvSet(DATA_KEY, d); } catch { /* best-effort */ }
  }

  return d;
}

export async function writeData(d) {
  await kvSet(DATA_KEY, d);
}

// ── Config helpers ────────────────────────────────────────────────────────────
export async function readConfig() {
  const c = await kvGet(CONFIG_KEY);
  if (!c) return DEFAULT_CONFIG;

  // Deep-merge stored config with DEFAULT_CONFIG so env-var fallbacks always
  // fill in any field that is missing or blank in the stored config.
  const merged = {
    ...DEFAULT_CONFIG,
    ...c,
    smtp:           { ...DEFAULT_CONFIG.smtp,           ...(c.smtp           || {}) },
    sharepoint:     { ...DEFAULT_CONFIG.sharepoint,     ...(c.sharepoint     || {}) },
    paymentDetails: { ...DEFAULT_CONFIG.paymentDetails, ...(c.paymentDetails || {}) },
    emailTemplate:  { ...DEFAULT_CONFIG.emailTemplate,  ...(c.emailTemplate  || {}) },
    stripe:         { ...DEFAULT_CONFIG.stripe,         ...(c.stripe         || {}) },
  };

  // Critical env-var overrides: if Redis has an empty value, use the env var.
  if (!merged.smtp.pass && process.env.SMTP_PASS) merged.smtp.pass = process.env.SMTP_PASS;
  if (!merged.smtp.host && process.env.SMTP_HOST) merged.smtp.host = process.env.SMTP_HOST;
  if (!merged.smtp.user && process.env.SMTP_USER) merged.smtp.user = process.env.SMTP_USER;

  return merged;
}

export async function writeConfig(c) {
  await kvSet(CONFIG_KEY, c);
}

// ── Session helpers ───────────────────────────────────────────────────────────
export async function createSession(user) {
  const exp = Date.now() + 8 * 3600 * 1000; // 8 hours
  const payload = Buffer.from(JSON.stringify({ user, exp })).toString("base64url");
  const sig = await hmacSign(payload);
  return `${payload}.${sig}`;
}

export async function invalidateSession(_token) {
  // Stateless tokens are invalidated when the admin password changes.
}

export async function invalidateAllSessions() {
  // No-op: changing cfg.pass changes the HMAC key, invalidating all old tokens.
}

export async function validToken(token) {
  if (!token || !token.includes(".")) return false;
  try {
    const lastDot = token.lastIndexOf(".");
    const payload = token.slice(0, lastDot);
    const sig     = token.slice(lastDot + 1);
    const expected = await hmacSign(payload);
    const sigBuf  = Buffer.from(sig,      "hex");
    const expBuf  = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expBuf)) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return Date.now() < exp;
  } catch {
    return false;
  }
}

// ── Request helpers ───────────────────────────────────────────────────────────
export function extractToken(req) {
  const auth = req.headers["authorization"] || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
