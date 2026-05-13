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

// ── Demo mode ─────────────────────────────────────────────────────────────────
// Set DEMO_MODE=true in Vercel env vars for the demo project only.
// In production this is false — behaviour is identical to before.
export const DEMO_MODE = process.env.DEMO_MODE === "true";

// ── KV key names — separate namespaces for production vs demo ─────────────────
const DATA_KEY   = DEMO_MODE ? "demo:data"   : "tocs:data";
const CONFIG_KEY = DEMO_MODE ? "demo:config" : "tocs:config";

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
    // Support both redis:// and rediss:// (TLS) URLs — e.g. Upstash uses rediss://.
    // Verify the server's TLS cert by default; Upstash and Vercel KV have
    // valid certs. Operators on private Redis with self-signed certs can opt
    // out via REDIS_ALLOW_INSECURE_TLS=1.
    const useTLS = REDIS_URL.startsWith("rediss://");
    const allowInsecure = process.env.REDIS_ALLOW_INSECURE_TLS === "1";
    _client = createClient({
      url: REDIS_URL,
      socket: useTLS ? { tls: true, rejectUnauthorized: !allowInsecure } : undefined,
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
    folderPath:   process.env.SHAREPOINT_FOLDER_PATH || "Top Owners Corporation Solution/ORDER DATABASE",
  },
  paymentDetails: {
    accountName:   "Top Owners Corporation",
    bsb:           "033-065",
    accountNumber: "522011",
    payid:         "accounts@tocs.com.au",
  },
  emailTemplate: {
    certificateSubject:       "Your OC Certificate — Order #{orderId}",
    certificateGreeting:      "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team",
    footer:                   "Top Owners Corporation Solution  |  info@tocs.co",
    adminNotificationSubject: "New Order — {orderType} #{orderId} — {total}",
    adminNotificationIntro:   "A new order has been placed.",
    keysOrderConfirmation:    "Your Keys/Fobs order{orderDesc} has been received. The invoice will be sent in a separate email, once payment is received, your order will be processed within the stated turnaround time.",
  },
  stripe: {
    secretKey:      "",
    publishableKey: "",
  },
  piq: {
    baseUrl:      "https://tocs.propertyiq.com.au",
    clientId:     "",
    clientSecret: "",
  },
};

// ── Demo seed data ────────────────────────────────────────────────────────────
// Used when DEMO_MODE=true and Redis has no demo:data/demo:config key yet,
// and by POST /api/demo/reset to restore the known state.
export const DEMO_DEFAULT_CONFIG = {
  admins: [{ id: "demo-admin", username: "demo@tocs.co", password: "Demo@1234", name: "Demo Admin" }],
  user: "demo@tocs.co", pass: "Demo@1234",
  orderEmail: "demo@tocs.co",
  logo: "",
  smtp: { host: "", port: 2525, user: "", pass: "" },
  sharepoint: { tenantId:"", clientId:"", clientSecret:"", siteId:"", folderPath:"" },
  paymentDetails: { accountName:"TOCS Demo Account", bsb:"000-000", accountNumber:"000000", payid:"demo@tocs.com.au" },
  paymentMethods: { bankEnabled: true, payidEnabled: true },
  emailTemplate: {
    certificateSubject: "Your OC Certificate — Order #{orderId}",
    certificateGreeting: "Dear {name},\n\nThis is a demo environment. No real certificate is attached.\n\nKind regards,\nTOCS Demo Team",
    footer: "TOCS Demo Environment — this is not a real transaction",
    adminNotificationSubject: "DEMO — New Order #{orderId}",
    adminNotificationIntro: "This is a demo order. No real action required.",
  },
  stripe: { secretKey: "", publishableKey: "" },
};

export const DEMO_DEFAULT_DATA = {
  strataPlans: [
    {
      id: "SP10001", name: "Harbour View Residences", address: "45 Marina Drive, Sydney NSW 2000", active: true,
      lots: [
        { id:"L1", number:"Lot 1",           level:"Ground",   type:"Residential", ownerCorps:["OC-A"] },
        { id:"L2", number:"Lot 2",           level:"Level 1",  type:"Residential", ownerCorps:["OC-A"] },
        { id:"L3", number:"Lot 3",           level:"Level 2",  type:"Residential", ownerCorps:["OC-A","OC-B"] },
        { id:"L4", number:"Lot 4",           level:"Level 3",  type:"Commercial",  ownerCorps:["OC-B"] },
        { id:"L5", number:"Lot 5 (Parking)", level:"Basement", type:"Parking",     ownerCorps:["OC-A"] },
      ],
      ownerCorps: {
        "OC-A": { name:"OC A — Residential", levy:1200 },
        "OC-B": { name:"OC B — Commercial",  levy:2800 },
      },
      products: [
        { id:"P1", name:"OC Certificate — Standard",         description:"s151 SMA Owner Corporation Certificate",            price:220, secondaryPrice:150, turnaround:"5 business days",   perOC:true  },
        { id:"P2", name:"OC Certificate — Urgent",           description:"Priority processing, 24–48 hour turnaround",        price:385, secondaryPrice:280, turnaround:"1–2 business days", perOC:true  },
        { id:"P3", name:"Register of Owners Search",         description:"Current register of lot owners and addresses",      price: 55,                    turnaround:"3 business days",   perOC:false },
        { id:"P4", name:"Insurance Certificate of Currency", description:"Current building insurance details and certificate", price: 75,                    turnaround:"2 business days",   perOC:false },
        { id:"K1", name:"Building Entry Key",                description:"Standard building entry key",                       price:  0,                    turnaround:"2–3 business days", perOC:false, category:"keys" },
        { id:"K2", name:"Car Park Fob",                      description:"Car park access fob/swipe",                         price:  0,                    turnaround:"2–3 business days", perOC:false, category:"keys" },
      ],
      shippingOptions: [
        { id:"pickup",  name:"Pickup / Email", price:0,  requiresAddress:false },
        { id:"post",    name:"Standard Post",  price:12, requiresAddress:true  },
        { id:"express", name:"Express Post",   price:25, requiresAddress:true  },
      ],
    },
    {
      id: "SP10002", name: "Parkside Gardens", address: "12 Garden Street, Melbourne VIC 3000", active: true,
      lots: [
        { id:"G1", number:"Lot 101",          level:"Level 1",  type:"Residential", ownerCorps:["OC-A"] },
        { id:"G2", number:"Lot 102",          level:"Level 1",  type:"Residential", ownerCorps:["OC-A"] },
        { id:"G3", number:"Lot 201",          level:"Level 2",  type:"Residential", ownerCorps:["OC-A"] },
        { id:"G4", number:"Lot 202",          level:"Level 2",  type:"Residential", ownerCorps:["OC-A"] },
        { id:"G5", number:"Lot G01 (Garage)", level:"Basement", type:"Parking",     ownerCorps:["OC-A"] },
      ],
      ownerCorps: { "OC-A": { name:"Parkside Gardens OC", levy:950 } },
      products: [
        { id:"Q1", name:"OC Certificate — Standard", description:"s151 SMA Owner Corporation Certificate",   price:200, secondaryPrice:140, turnaround:"5 business days",   perOC:true  },
        { id:"Q2", name:"OC Certificate — Urgent",   description:"Priority processing, 24–48 hour turnaround", price:360, secondaryPrice:260, turnaround:"1–2 business days", perOC:true  },
        { id:"Q3", name:"Insurance Certificate",     description:"Building insurance details and certificate", price: 70,                    turnaround:"2 business days",   perOC:false },
      ],
    },
  ],
  orders: [
    { id:"DEMO-001", planId:"SP10001", orderCategory:"oc", contactInfo:{name:"Sarah Johnson",email:"sarah.j@lawfirm.com.au",phone:"0412 345 678",companyName:"Johnson Legal"}, status:"Pending Payment", payment:"bank", items:[{productId:"P1",lotNumber:"Lot 1",planName:"Harbour View Residences",ocName:"OC A — Residential",ocId:"OC-A",productName:"OC Certificate — Standard",qty:1,price:220}], date:"2026-03-25T09:12:00.000Z", total:220, auditLog:[{ts:"2026-03-25T09:12:00.000Z",action:"Order created",note:"Customer: Sarah Johnson"}] },
    { id:"DEMO-002", planId:"SP10001", orderCategory:"oc", contactInfo:{name:"Michael Chen",email:"m.chen@conveyancing.com",phone:"0421 987 654",companyName:"Chen & Partners"}, status:"Processing", payment:"bank", items:[{productId:"P1",lotNumber:"Lot 3",planName:"Harbour View Residences",ocName:"OC A — Residential",ocId:"OC-A",productName:"OC Certificate — Standard",qty:1,price:220},{productId:"P1",lotNumber:"Lot 3",planName:"Harbour View Residences",ocName:"OC B — Commercial",ocId:"OC-B",productName:"OC Certificate — Standard",qty:1,price:150}], date:"2026-03-24T14:30:00.000Z", total:370, auditLog:[{ts:"2026-03-24T14:30:00.000Z",action:"Order created"},{ts:"2026-03-24T16:00:00.000Z",action:"Status changed to Processing"}] },
    { id:"DEMO-003", planId:"SP10001", orderCategory:"oc", contactInfo:{name:"Emma Williams",email:"emma@propertysearch.com.au",phone:"0433 111 222"}, status:"Issued", payment:"payid", items:[{productId:"P2",lotNumber:"Lot 2",planName:"Harbour View Residences",ocName:"OC A — Residential",ocId:"OC-A",productName:"OC Certificate — Urgent",qty:1,price:385}], date:"2026-03-23T10:00:00.000Z", total:385, auditLog:[{ts:"2026-03-23T10:00:00.000Z",action:"Order created"},{ts:"2026-03-23T11:30:00.000Z",action:"Status changed to Processing"},{ts:"2026-03-24T09:00:00.000Z",action:"Certificate issued"}] },
    { id:"DEMO-004", planId:"SP10002", orderCategory:"oc", contactInfo:{name:"David Park",email:"david.p@email.com",phone:"0455 333 444",companyName:"Park Conveyancing"}, status:"Awaiting Documents", payment:"bank", items:[{productId:"Q1",lotNumber:"Lot 101",planName:"Parkside Gardens",ocName:"Parkside Gardens OC",ocId:"OC-A",productName:"OC Certificate — Standard",qty:1,price:200}], date:"2026-03-25T11:45:00.000Z", total:200, auditLog:[{ts:"2026-03-25T11:45:00.000Z",action:"Order created"},{ts:"2026-03-25T13:00:00.000Z",action:"Status changed to Awaiting Documents"}] },
    { id:"DEMO-005", planId:"SP10001", orderCategory:"oc", contactInfo:{name:"Priya Sharma",email:"priya@legalgroup.com",phone:"0466 555 666",companyName:"Legal Group Pty Ltd"}, status:"On Hold", payment:"bank", items:[{productId:"P1",lotNumber:"Lot 4",planName:"Harbour View Residences",ocName:"OC B — Commercial",ocId:"OC-B",productName:"OC Certificate — Standard",qty:1,price:220}], date:"2026-03-22T08:20:00.000Z", total:220, auditLog:[{ts:"2026-03-22T08:20:00.000Z",action:"Order created"},{ts:"2026-03-22T10:00:00.000Z",action:"Status changed to On Hold"}] },
    { id:"DEMO-006", planId:"SP10002", orderCategory:"oc", contactInfo:{name:"James Liu",email:"james.liu@buysell.com.au",phone:"0477 777 888"}, status:"Cancelled", payment:"bank", items:[{productId:"Q1",lotNumber:"Lot 201",planName:"Parkside Gardens",ocName:"Parkside Gardens OC",ocId:"OC-A",productName:"OC Certificate — Standard",qty:1,price:200}], date:"2026-03-20T15:00:00.000Z", total:200, auditLog:[{ts:"2026-03-20T15:00:00.000Z",action:"Order created"},{ts:"2026-03-21T09:00:00.000Z",action:"Order cancelled"}] },
    { id:"DEMO-007", planId:"SP10001", orderCategory:"oc", contactInfo:{name:"Olivia Brown",email:"olivia.b@settlements.com",phone:"0488 999 000",companyName:"Brown Settlements"}, status:"Invoice to be issued", payment:"invoice", items:[{productId:"P4",lotNumber:"Lot 5 (Parking)",planName:"Harbour View Residences",ocName:"OC A — Residential",ocId:"OC-A",productName:"Insurance Certificate of Currency",qty:1,price:75}], date:"2026-03-26T07:30:00.000Z", total:75, auditLog:[{ts:"2026-03-26T07:30:00.000Z",action:"Order created"}] },
  ],
};

// ── Stateless HMAC token helpers ──────────────────────────────────────────────
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const IS_PROD = process.env.NODE_ENV === "production";
// Stable dev-only secret — used ONLY when NODE_ENV !== "production" and
// TOKEN_SECRET is unset. Production deploys must set TOKEN_SECRET; getSecret()
// throws otherwise. The secret is intentionally not derived from the admin
// password (a previous behaviour) so that rotating the admin password no
// longer changes the signing key — session invalidation is now handled by
// the session-epoch mechanism below.
const DEV_FALLBACK_SECRET = "tocs-dev-only-secret-DO-NOT-USE-IN-PRODUCTION";

if (!process.env.TOKEN_SECRET) {
  if (IS_PROD) {
    console.error("[store.js] CRITICAL: TOKEN_SECRET env var is not set in production. Auth endpoints will refuse to issue or accept tokens.");
  } else {
    console.warn("[store.js] WARNING: TOKEN_SECRET not set — using insecure dev fallback. Set TOKEN_SECRET before deploying.");
  }
}

function getSecret() {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
  if (IS_PROD) {
    throw new Error("TOKEN_SECRET environment variable is required in production.");
  }
  return DEV_FALLBACK_SECRET;
}

function hmacSign(payload) {
  const secret = getSecret();
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ── Session epoch ─────────────────────────────────────────────────────────────
// All sessions embed the current epoch in their payload. Bumping the epoch
// (e.g. on password change) invalidates every previously-issued token without
// having to track them individually.
const SESSION_EPOCH_KEY = DEMO_MODE ? "demo:session_epoch" : "tocs:session_epoch";

async function getSessionEpoch() {
  if (!KV_AVAILABLE) return 0;
  try {
    const v = await kvGet(SESSION_EPOCH_KEY);
    return Number(v) || 0;
  } catch {
    return 0;
  }
}

export async function bumpSessionEpoch() {
  if (!KV_AVAILABLE) return;
  try {
    const client = await getClient();
    await client.incr(SESSION_EPOCH_KEY);
  } catch (err) {
    console.error("bumpSessionEpoch failed:", err.message);
  }
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
    throw err;
  }
}

// ttlSeconds is optional; when provided, the key expires after that many seconds.
async function kvSet(key, value, ttlSeconds) {
  if (!KV_AVAILABLE) {
    throw new Error(NO_KV_MSG);
  }
  try {
    const client = await getClient();
    const serialised = JSON.stringify(value);
    if (ttlSeconds) {
      await client.set(key, serialised, { EX: ttlSeconds });
    } else {
      await client.set(key, serialised);
    }
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

export { kvGet, kvSet, kvDel };

// ── Authority document helpers ────────────────────────────────────────────────
// TTL: 90 days. Authority docs are uploaded at order-creation time and are
// only needed during processing — once the certificate is issued, SharePoint
// becomes the long-term store and the Redis copy is redundant. Note this is
// SHORTER than the certificate TTL below (365 d) — if an admin tries to
// re-download a >90 d old order's authority via the KV fallback path, the
// authority KV entry will already have expired; they must rely on the
// SharePoint copy. By design — KV is a hot cache, SharePoint is canonical.
export async function writeAuthority(orderId, doc) {
  // Pass doc directly — kvSet already calls JSON.stringify internally.
  await kvSet(`tocs:authority:${orderId}`, doc, 90 * 86400);
}

export async function readAuthority(orderId) {
  return await kvGet(`tocs:authority:${orderId}`);
}

// ── Issued-certificate helpers ────────────────────────────────────────────────
// Stores a copy of the OC certificate / keys order attachment that was emailed
// to the applicant. Acts as a guaranteed fallback for admin re-download when
// the SharePoint upload fails or the SP link is unreachable. TTL: 365 days —
// longer than authority docs (90 d) because issued certificates are more
// likely to be referenced months later (re-send to a different recipient,
// regulator request, etc.) and the storage cost is similar. SharePoint
// remains the canonical long-term store; KV is the safety net.
export async function writeCertificate(orderId, doc) {
  await kvSet(`tocs:certificate:${orderId}`, doc, 365 * 86400);
}

export async function readCertificate(orderId) {
  return await kvGet(`tocs:certificate:${orderId}`);
}

// ── PIQ poll status helpers ───────────────────────────────────────────────────
// Stores the result of the most recent /api/orders?action=poll-piq run so the
// admin UI can surface "last auto-poll succeeded N hours ago" without scraping
// Vercel logs. Kept in a dedicated KV key (separate from data/config) so a
// concurrent poll never races writeData() back over an order-status update.
//
// Cron and manual runs are stored in *separate* slots so a manual "Check PIQ"
// click never makes the auto-poll banner look healthy when the Vercel cron is
// actually broken — staleness is only ever judged against the cron slot.
//
// Demo deployments get their own key so they cannot overwrite or read the
// production banner state when sharing a Redis instance (matches DATA_KEY).
const POLL_PIQ_STATUS_KEY = DEMO_MODE ? "demo:poll-piq:last-run" : "tocs:poll-piq:last-run";

export async function writePiqPollStatus(status) {
  const slot    = status?.trigger === "cron" ? "lastCron" : "lastManual";
  const entry   = { ts: new Date().toISOString(), ...status };
  const current = (await kvGet(POLL_PIQ_STATUS_KEY)) || {};
  current[slot] = entry;
  await kvSet(POLL_PIQ_STATUS_KEY, current);
}

export async function readPiqPollStatus() {
  return await kvGet(POLL_PIQ_STATUS_KEY);
}

export { KV_AVAILABLE };

// ── Data helpers ──────────────────────────────────────────────────────────────
export async function readData() {
  const d = await kvGet(DATA_KEY);
  if (!d) return DEMO_MODE ? structuredClone(DEMO_DEFAULT_DATA) : DEFAULT_DATA;

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
  if (!c) return DEMO_MODE ? structuredClone(DEMO_DEFAULT_CONFIG) : DEFAULT_CONFIG;

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
    piq:            { ...DEFAULT_CONFIG.piq,            ...(c.piq            || {}) },
  };

  // Once an admins[] array is in place, do not let DEFAULT_CONFIG.pass /
  // DEFAULT_CONFIG.user resurrect a plaintext default password through the
  // merge. The admins[] array is now the only source of truth.
  if (Array.isArray(c.admins) && c.admins.length > 0) {
    delete merged.pass;
    if (!c.user) merged.user = c.admins[0].username;
  }

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
  const epoch = await getSessionEpoch();
  const payload = Buffer.from(JSON.stringify({ user, exp, epoch })).toString("base64url");
  const sig = hmacSign(payload);
  return `${payload}.${sig}`;
}

// Decode and verify a token. Returns the parsed payload object on success,
// or null on any failure (bad signature, expired, stale epoch, malformed).
export async function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  try {
    const lastDot = token.lastIndexOf(".");
    const payload = token.slice(0, lastDot);
    const sig     = token.slice(lastDot + 1);
    if (!/^[0-9a-f]{64}$/.test(sig)) return null;
    const expected = hmacSign(payload);
    const sigBuf  = Buffer.from(sig,      "hex");
    const expBuf  = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof parsed?.exp !== "number" || Date.now() >= parsed.exp) return null;
    // Reject tokens issued before the current session epoch.
    const currentEpoch = await getSessionEpoch();
    if ((parsed.epoch ?? 0) < currentEpoch) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function validToken(token) {
  return (await verifyToken(token)) !== null;
}

export async function invalidateSession(_token) {
  // Stateless tokens are invalidated by bumping the session epoch.
}

export async function invalidateAllSessions() {
  await bumpSessionEpoch();
}

// ── Request helpers ───────────────────────────────────────────────────────────
export function extractToken(req) {
  const auth = req.headers["authorization"] || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

// Exact-origin allow-list. The previous startsWith() check accepted
// https://tocs.co.evil.com because it began with an allowed prefix.
const ALLOWED_ORIGINS = new Set([
  "https://occorder.vercel.app",
  "https://tocs.co",
  "https://www.tocs.co",
  "http://localhost:5173",
  "http://localhost:3000",
]);
export function cors(res, req) {
  const origin = req?.headers?.origin;
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Cron-Secret");
  // Bearer tokens travel in the Authorization header — cookies are not used,
  // so credentialed mode is unnecessary and would broaden CSRF surface.
}

// ── Per-IP rate limiter ───────────────────────────────────────────────────────
// Simple sliding-window-style counter using Redis EX. Returns:
//   { allowed: true,  remaining }  when the request is permitted
//   { allowed: false, retryAfter } (seconds) when the cap is hit
// `key` should be specific (e.g. "track:1.2.3.4"); pass max + window in seconds.
// When KV is unavailable this is a no-op (allowed = true) — the caller still
// gets best-effort protection rather than 503-ing every request.
export async function rateLimit(key, max, windowSeconds) {
  if (!KV_AVAILABLE) return { allowed: true, remaining: max };
  const k = `tocs:rl:${key}`;
  try {
    const client = await getClient();
    const cnt = await client.incr(k);
    if (cnt === 1) {
      await client.expire(k, windowSeconds);
    }
    if (cnt > max) {
      let ttl = await client.ttl(k);
      if (ttl < 0) ttl = windowSeconds;
      return { allowed: false, retryAfter: ttl };
    }
    return { allowed: true, remaining: Math.max(0, max - cnt) };
  } catch (err) {
    console.error("rateLimit error:", err.message);
    return { allowed: true, remaining: max };
  }
}

// Returns the originating client IP for rate-limiting purposes.
//
// Selection order:
//   1. `x-vercel-forwarded-for` — set by Vercel's edge. Clients cannot forge
//      this header at Vercel (the platform overwrites it on ingress).
//      Vercel populates it such that the **leftmost** entry is the
//      originating client (Vercel's own hops, if any, are appended right of
//      that), so we take `[0]`.
//   2. The **rightmost** entry of `x-forwarded-for`. Outside of Vercel
//      `x-vercel-forwarded-for` is absent; XFF is the next-most-trustworthy
//      signal but only when *something* trustworthy appended Vercel-side.
//      A bare client-supplied XFF (no proxy hop) would still be spoofable
//      here — local dev / non-Vercel deployments should rely on a proxy
//      that appends its own IP rightmost.
//   3. `req.socket?.remoteAddress` — direct-connection fallback.
//
// Naive `xff.split(",")[0]` (the previous implementation) returned the
// *client-supplied* leftmost entry on Vercel and was trivially spoofable.
export function clientIp(req) {
  const vercel = req.headers["x-vercel-forwarded-for"];
  if (typeof vercel === "string" && vercel.trim()) {
    // Leftmost = originating client per Vercel's documented format.
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const last = xff.split(",").pop()?.trim();
    if (last) return last;
  }
  return req.socket?.remoteAddress || "unknown";
}

// ── Per-order mutation lock ───────────────────────────────────────────────────
// Backed by Redis SET NX EX. Use to serialise concurrent mutations on a single
// order (Stripe webhook + stripe-confirm racing, dual amend submits, etc.).
// Falls open when KV is unavailable so local dev still works.
const LOCK_TTL_SECONDS = 10;
const LOCK_RETRY_MS    = 75;
const LOCK_MAX_WAIT_MS = 5000;

export async function withOrderLock(orderId, fn) {
  if (!KV_AVAILABLE) return await fn();
  const key   = `tocs:lock:order:${orderId}`;
  const token = randomBytes(16).toString("hex");
  const client = await getClient();
  const start  = Date.now();
  let acquired = false;
  while (Date.now() - start < LOCK_MAX_WAIT_MS) {
    const ok = await client.set(key, token, { NX: true, EX: LOCK_TTL_SECONDS });
    if (ok === "OK") { acquired = true; break; }
    await new Promise(r => setTimeout(r, LOCK_RETRY_MS));
  }
  if (!acquired) {
    throw new Error("Order is busy — please try again.");
  }
  try {
    return await fn();
  } finally {
    // Best-effort release; only delete if we still own the lock.
    try {
      const current = await client.get(key);
      if (current === token) await client.del(key);
    } catch { /* lock will expire via TTL */ }
  }
}

// ── Stripe webhook event deduplication ────────────────────────────────────────
// Stripe retries webhook events on non-2xx; if the same event.id is delivered
// twice, both invocations would otherwise repeat side effects (emails, status
// flips). We mark the event ID as processed for 7 days; subsequent calls
// short-circuit. SET NX semantics guarantee atomic check-and-set.
const STRIPE_EVENT_TTL_SECONDS = 7 * 24 * 3600;

export async function tryClaimStripeEvent(eventId) {
  if (!KV_AVAILABLE) return true; // best-effort allow
  if (!eventId || typeof eventId !== "string") return false;
  try {
    const client = await getClient();
    const ok = await client.set(
      `tocs:stripe:event:${eventId}`,
      String(Date.now()),
      { NX: true, EX: STRIPE_EVENT_TTL_SECONDS }
    );
    return ok === "OK";
  } catch (err) {
    console.error("tryClaimStripeEvent error:", err.message);
    return true; // fall open — better to risk a duplicate than reject a valid event
  }
}
