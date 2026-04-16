// api/_lib/piq.js
// PropertyIQ (PIQ) API client — OAuth2 + data helpers
//
// PIQ API is READ-ONLY. It cannot create levies or invoices.
// Admin must create the special levy manually in PropertyIQ, including
// the platform order ID in the levy description so the platform can
// detect payment automatically.
//
// Credentials stored in cfg.piq: { baseUrl, clientId, clientSecret }
// Token is cached in Redis to avoid re-auth on every poll.

import { kvGet, kvSet } from "./store.js";

const TOKEN_CACHE_KEY = "tocs:piq_token";

// ── OAuth2 token management ───────────────────────────────────────────────────

/**
 * Get a valid PIQ OAuth2 access token (client_credentials grant).
 * Caches in Redis with TTL; refreshes automatically when within 60s of expiry.
 *
 * @param {object} cfg  - app config from readConfig()
 * @returns {{ access_token: string, baseUrl: string }}
 * @throws {Error} if credentials missing or PIQ auth fails
 */
export async function getPiqToken(cfg) {
  const piq          = cfg.piq || {};
  const baseUrl      = (piq.baseUrl || "https://tocs.propertyiq.com.au").replace(/\/$/, "");
  const clientId     = piq.clientId     || "";
  const clientSecret = piq.clientSecret || "";

  if (!clientId || !clientSecret) {
    throw new Error("PIQ credentials not configured (missing clientId or clientSecret).");
  }

  // Return cached token if still valid (with 60s buffer)
  try {
    const cached = await kvGet(TOKEN_CACHE_KEY);
    if (cached?.access_token && cached.expires_at > Date.now() + 60_000) {
      return { access_token: cached.access_token, baseUrl };
    }
  } catch { /* fall through to re-auth */ }

  // Request new token
  const params = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     clientId,
    client_secret: clientSecret,
    // No scope param — PIQ tenant applies default scopes automatically
  });

  const resp = await fetch(`${baseUrl}/oauth/access_token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => String(resp.status));
    throw new Error(`PIQ auth failed (${resp.status}): ${text.substring(0, 200)}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error("PIQ auth: no access_token in response.");

  const expiresIn  = data.expires_in || 3600;
  const expires_at = Date.now() + expiresIn * 1000;

  // Cache token (subtract 30s to refresh before actual expiry)
  try {
    await kvSet(TOKEN_CACHE_KEY, { access_token: data.access_token, expires_at }, expiresIn - 30);
  } catch { /* best-effort */ }

  return { access_token: data.access_token, baseUrl };
}

// ── Internal GET helper ───────────────────────────────────────────────────────

async function piqGet(access_token, baseUrl, path, params = {}) {
  const url = new URL(`${baseUrl}/api${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${access_token}` },
    signal:  AbortSignal.timeout(12_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => String(resp.status));
    throw new Error(`PIQ GET ${path} failed (${resp.status}): ${text.substring(0, 200)}`);
  }
  return resp.json();
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

/**
 * Find a PIQ building by strata plan number (splan).
 * @param {object} cfg    - app config
 * @param {string} splan  - strata plan number, e.g. "SP12345"
 * @returns {object|null} building object or null if not found
 */
export async function getPiqBuilding(cfg, splan) {
  const { access_token, baseUrl } = await getPiqToken(cfg);
  const result = await piqGet(access_token, baseUrl, "/buildings", { splan, number: 5 });
  const list   = Array.isArray(result) ? result : (result?.data || []);
  // Prefer exact splan match
  const exact  = list.find(b => String(b.splan || "").toLowerCase() === String(splan).toLowerCase());
  return exact || list[0] || null;
}

/**
 * Get all schedules (Owner Corporations) for a building.
 * Requires GET /buildings/{id}?include=schedule.
 * @returns {Array} array of BuildingSchedule objects { id, name, ... }
 */
export async function getPiqSchedules(cfg, buildingId) {
  const { access_token, baseUrl } = await getPiqToken(cfg);
  // Single-building endpoint returns { data: <Building>, links: {} }
  // Schedule data lives at result.data.schedules.data (not result.schedules.data)
  const result = await piqGet(access_token, baseUrl, `/buildings/${buildingId}`, { include: "schedule" });
  return result?.data?.schedules?.data || [];
}

/**
 * Get all lots for a building (handles pagination automatically).
 * @returns {Array} flat array of Lot objects
 */
export async function getPiqLots(cfg, buildingId) {
  const { access_token, baseUrl } = await getPiqToken(cfg);
  const PAGE_SIZE = 100;
  const allLots   = [];
  let   page      = 1;

  while (true) {
    const result    = await piqGet(access_token, baseUrl, `/buildings/${buildingId}/lots`, {
      number: PAGE_SIZE,
      page,
      include: "ownerContact",
    });
    const pageData = Array.isArray(result) ? result : (result?.data || []);
    if (!pageData.length) break;
    allLots.push(...pageData);
    if (pageData.length < PAGE_SIZE) break; // last page
    page++;
  }

  return allLots;
}

/**
 * Get the full lot ledger (all transaction types: levy + receipt + refund + obal).
 * Fetching all types in a single call allows matching receipts to levies without
 * a second API round-trip.
 * @returns {Array} flat array of LotLedgerTransaction objects
 */
export async function getPiqLotLedger(cfg, piqLotId) {
  const { access_token, baseUrl } = await getPiqToken(cfg);
  const result = await piqGet(access_token, baseUrl, `/lots/${piqLotId}/ledger`, {
    number:  500, // generous limit — most lots have far fewer transactions
    summary: true,
  });
  return Array.isArray(result) ? result : (result?.data || []);
}

// ── Payment detection ─────────────────────────────────────────────────────────

/**
 * Detect whether a special levy has been paid for a given order.
 *
 * Mechanism: admin creates a Special Levy in PIQ with the platform orderId
 * in the description/reference field. This function searches the lot ledger
 * for a matching levy entry and checks if totalNett <= 0 (fully paid).
 *
 * If paid, finds the matching receipt transaction for payment date + reference.
 *
 * @param {object} cfg         - app config from readConfig()
 * @param {number} piqLotId    - PIQ lot ID (stored on the order at creation time)
 * @param {string} orderId     - platform order ID (searched in levy details/reference)
 *
 * @returns one of:
 *   { levyFound: false }
 *   { levyFound: true, paid: false, totalDue, totalNett }
 *   { levyFound: true, paid: true,  totalDue, totalPaid, paymentDate, paymentReference }
 */
export async function detectPiqPayment(cfg, piqLotId, orderId) {
  const transactions = await getPiqLotLedger(cfg, piqLotId);
  const lowerOrderId = String(orderId).toLowerCase();

  // Find the levy whose description or reference contains the platform order ID
  const levy = transactions.find(t =>
    t.type === "levy" && (
      (t.details   && t.details.toLowerCase().includes(lowerOrderId)) ||
      (t.reference && t.reference.toLowerCase().includes(lowerOrderId))
    )
  );

  if (!levy) return { levyFound: false };

  const totalDue  = levy.totalDue  ?? 0;
  const totalPaid = levy.totalPaid ?? 0;
  const totalNett = levy.totalNett ?? (totalDue - totalPaid);

  // Use a small epsilon to handle floating-point precision
  if (totalNett > 0.005) {
    return { levyFound: true, paid: false, totalDue, totalNett };
  }

  // Payment confirmed — find the matching receipt entry for date + reference
  const receipt = transactions.find(t =>
    t.type === "receipt" &&
    t.levyId != null &&
    t.levyId === levy.levyId
  );

  return {
    levyFound:        true,
    paid:             true,
    totalDue,
    totalPaid:        totalPaid || totalDue, // if totalPaid missing, assume full payment
    paymentDate:      receipt?.date      || levy.date  || null,
    paymentReference: receipt?.reference || null,
  };
}

/**
 * List all buildings in the PIQ tenant (single page, max 500).
 * Returns { buildings: [{ piqBuildingId, splan, name }], warning? }
 *
 * Single-page only — avoids Vercel 10s timeout with multiple round-trips.
 * If exactly 500 results are returned, a warning is set (list may be incomplete).
 */
export async function getAllPiqBuildings(cfg) {  const { access_token, baseUrl } = await getPiqToken(cfg);
  const result = await piqGet(access_token, baseUrl, "/buildings", { number: 500 });
  const list   = Array.isArray(result) ? result : (result?.data || []);

  const buildings = list.map(b => ({
    piqBuildingId: b.id,
    splan:         b.splan || null,
    name:          b.buildingName || b.name || `Building ${b.id}`,
    address:       b.address || b.buildingAddress || b.propertyAddress || "",
  }));

  let warning = null;
  if (buildings.length === 0) {
    warning = "No buildings returned from PIQ — verify API access and credentials.";
  } else if (buildings.length === 500) {
    warning = "Only the first 500 buildings were returned. If your account has more, some may not appear.";
  }

  return { buildings, warning };
}

/**
 * Fetch a single building by its PIQ building ID.
 * Uses GET /buildings/{id} — returns the full building object (more fields than the list endpoint).
 * @returns {object|null} raw building object or null on failure
 */
export async function getPiqBuildingById(cfg, buildingId) {
  const { access_token, baseUrl } = await getPiqToken(cfg);
  const result = await piqGet(access_token, baseUrl, `/buildings/${buildingId}`);
  // Individual endpoint wraps in { data: building, links: {} }; some versions return the object directly
  return result?.data || result || null;
}

/**
 * Extract a normalised address string from a raw PIQ building object.
 * PIQ may return address as a string or as a structured { street, suburb, state, postcode } object.
 */
export function extractPiqAddress(building) {
  const raw = building?.address ?? building?.buildingAddress ?? building?.propertyAddress ?? building?.streetAddress ?? null;
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") {
    return [raw.street, raw.suburb, raw.state, raw.postcode].filter(Boolean).join(", ");
  }
  return "";
}
