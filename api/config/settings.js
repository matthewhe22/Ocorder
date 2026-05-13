import { readConfig, writeConfig, validToken, extractToken, cors, kvGet, kvSet, KV_AVAILABLE } from "../_lib/store.js";
import { getPiqToken, getPiqBuilding, getPiqSchedules, getPiqLots, getAllPiqBuildings, getPiqBuildingById, extractPiqAddress } from "../_lib/piq.js";
import Stripe from "stripe";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = extractToken(req);
  if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

  if (req.method === "GET") {
    try {
      const cfg = await readConfig();
      // Load logo from its dedicated Redis key (avoids inflating every readConfig() call).
      // Fall back to any logo already stored in the main config key for backward compat.
      if (KV_AVAILABLE) {
        cfg.logo = await kvGet("tocs:logo") || cfg.logo || null;
      }
      const smtp = cfg.smtp || {};
      const pd   = cfg.paymentDetails || {};
      const et   = cfg.emailTemplate || {};
      const sp   = cfg.sharepoint || {};
      const pm   = cfg.paymentMethods || {};
      return res.status(200).json({
        orderEmail: cfg.orderEmail || "Orders@tocs.co",
        logo: cfg.logo || "",
        smtp: { host: smtp.host || "mail-au.smtp2go.com", port: smtp.port || 2525, user: smtp.user || "OCCAPP", pass: smtp.pass ? "••••••••" : "" },
        paymentDetails: { accountName: pd.accountName || "Top Owners Corporation", bsb: pd.bsb || "033-065", accountNumber: pd.accountNumber || "522011", payid: pd.payid || "accounts@tocs.com.au" },
        emailTemplate: {
          certificateSubject:       et.certificateSubject       || "Your OC Certificate — Order #{orderId}",
          certificateGreeting:      et.certificateGreeting      || "",
          footer:                   et.footer                   || "",
          adminNotificationSubject: et.adminNotificationSubject || "New Order — {orderType} #{orderId} — {total}",
          adminNotificationIntro:   et.adminNotificationIntro   || "A new order has been placed.",
        },
        sharepoint: {
          tenantId:     sp.tenantId     || "",
          clientId:     sp.clientId     || "",
          clientSecret: sp.clientSecret ? "••••••••" : "",
          siteId:       sp.siteId       || "",
          folderPath:   sp.folderPath   || "Top Owners Corporation Solution/ORDER DATABASE",
        },
        stripe: {
          secretKey:      cfg.stripe?.secretKey      ? "••••••••" : "",
          publishableKey: cfg.stripe?.publishableKey || "",
        },
        piq: {
          baseUrl:      cfg.piq?.baseUrl      || "https://tocs.propertyiq.com.au",
          clientId:     cfg.piq?.clientId     || "",
          clientSecret: cfg.piq?.clientSecret ? "••••••••" : "",
        },
        paymentMethods: {
          bankEnabled:  pm.bankEnabled  !== false,
          payidEnabled: pm.payidEnabled !== false,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to load settings: " + err.message });
    }
  }

  // POST /api/config/settings?action=test-stripe  ← must be BEFORE generic POST block
  if (req.method === "POST" && req.query?.action === "test-stripe") {
    try {
      const cfg = await readConfig();
      const resolvedKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
      if (!resolvedKey) {
        return res.status(200).json({ ok: false, error: "No Stripe secret key configured." });
      }
      const keySource = cfg.stripe?.secretKey ? "config" : "env";
      const stripe = new Stripe(resolvedKey);
      const account = await stripe.accounts.retrieve();
      const mode = resolvedKey.startsWith("sk_live_") ? "live" : "test";
      return res.status(200).json({ ok: true, mode, accountId: account.id, keySource });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // POST /api/config/settings?action=test-piq  ← verify PIQ OAuth credentials
  if (req.method === "POST" && req.query?.action === "test-piq") {
    try {
      const cfg = await readConfig();
      const { access_token, baseUrl } = await getPiqToken(cfg);
      // Light check: fetch 1 building to confirm the token works
      const resp = await fetch(`${baseUrl}/api/buildings?number=1`, {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return res.status(200).json({ ok: false, error: `PIQ API returned ${resp.status}` });
      const data = await resp.json();
      const count = Array.isArray(data) ? data.length : (data?.data?.length ?? 0);
      return res.status(200).json({ ok: true, message: `Connected — ${count} building(s) visible` });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // POST /api/config/settings?action=fetch-piq-building-address
  // Body: { piqBuildingId: 123 }  OR  { planId: "PS726461P" }
  // Lightweight: fetches only the building record (no schedules, no lots).
  // Returns: { ok, piqBuildingId, buildingName, address }
  if (req.method === "POST" && req.query?.action === "fetch-piq-building-address") {
    try {
      const { planId, piqBuildingId: bodyBuildingId } = req.body || {};
      if (!planId && !bodyBuildingId) return res.status(400).json({ error: "Provide planId or piqBuildingId." });

      const cfg = await readConfig();
      let building, resolvedId;

      if (bodyBuildingId) {
        resolvedId = bodyBuildingId;
        building   = await getPiqBuildingById(cfg, bodyBuildingId);
      } else {
        // List search by splan to get the building ID, then fetch individual record
        const listBuilding = await getPiqBuilding(cfg, planId);
        if (!listBuilding) return res.status(200).json({ ok: false, error: `Building not found in PIQ for plan "${planId}".` });
        resolvedId = listBuilding.id;
        // Individual endpoint has more detail (e.g. address) than the list endpoint
        building = await getPiqBuildingById(cfg, resolvedId);
        if (!building) building = listBuilding; // last-resort fallback to list data
      }

      if (!building) return res.status(200).json({ ok: false, error: "Building not found in PIQ." });

      const address = extractPiqAddress(building);

      // Always include _debugKeys so admins can see what fields PIQ returned when address is empty
      const _debugKeys = Object.entries(building)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");

      return res.status(200).json({
        ok:            true,
        piqBuildingId: resolvedId,
        buildingName:  building.buildingName || building.name || "",
        address,
        _debugKeys,
      });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // POST /api/config/settings?action=list-piq-buildings
  // Returns all PIQ buildings (single page, max 100) for building discovery.
  if (req.method === "POST" && req.query?.action === "list-piq-buildings") {
    try {
      const cfg = await readConfig();
      const { buildings, warning } = await getAllPiqBuildings(cfg);
      return res.status(200).json({ ok: true, buildings, ...(warning ? { warning } : {}) });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // POST /api/config/settings?action=sync-piq
  // Body: { planId: "SP12345" }  OR  { piqBuildingId: 123 }
  // planId branch: looks up building by splan, returns buildingName + schedules + lots.
  // piqBuildingId branch: skips lookup (caller already knows the building), returns schedules + lots only.
  if (req.method === "POST" && req.query?.action === "sync-piq") {
    try {
      const { planId, piqBuildingId: bodyBuildingId } = req.body || {};
      if (!planId && !bodyBuildingId) return res.status(400).json({ error: "Provide planId or piqBuildingId." });
      if (planId  &&  bodyBuildingId) return res.status(400).json({ error: "Provide planId or piqBuildingId, not both." });

      const cfg = await readConfig();

      let piqBuildingId, buildingName, buildingAddress;

      if (planId) {
        // Original path: find building by splan
        const building = await getPiqBuilding(cfg, planId);
        if (!building) return res.status(404).json({ error: `No PIQ building found for splan "${planId}".` });
        piqBuildingId   = building.id;
        buildingName    = building.buildingName || building.name;
        buildingAddress = building.address || building.buildingAddress || building.propertyAddress || null;
      } else {
        // New path: piqBuildingId supplied directly — skip splan lookup
        piqBuildingId   = bodyBuildingId;
        buildingName    = undefined; // caller already has the name from list-piq-buildings
        buildingAddress = undefined; // caller already has the address from list-piq-buildings
      }

      // Fetch schedules (Owner Corporations)
      const rawSchedules = await getPiqSchedules(cfg, piqBuildingId);

      // Fetch all lots (paginated)
      const rawLots = await getPiqLots(cfg, piqBuildingId);

      // Map PIQ schedules → platform ownerCorp format
      const schedules = rawSchedules.map(s => ({
        piqScheduleId: s.id,
        name:          s.name || `Schedule ${s.id}`,
      }));

      // Map PIQ lots → platform lot format.
      // Address fields may be top-level scalars OR nested under l.address / l.propertyAddress.
      const lots = rawLots.map(l => {
        const addr = l.address || l.propertyAddress || l.physicalAddress || {};
        return {
          piqLotId:     l.id,
          lotNumber:    l.lotNumber  || l.lot    || l.number || String(l.id),
          unitNumber:   l.unitNumber || l.unit   || addr.unitNumber || addr.unit || "",
          streetNumber: l.streetNumber || l.houseNumber || l.streetNo ||
                        addr.streetNumber || addr.houseNumber || addr.streetNo || "",
          streetName:   l.streetName || l.street ||
                        addr.streetName || addr.street || "",
          ownerName:    l.ownerContact?.name || l.name || "",
        };
      });

      // Include raw first lot for debugging — lets admin inspect what fields PIQ actually returns
      // so field-name mapping can be verified/corrected without guessing.
      const _debugRawLot = rawLots.length > 0 ? rawLots[0] : null;

      const response = { ok: true, piqBuildingId, schedules, lots, _debugRawLot };
      if (buildingName    !== undefined) response.buildingName    = buildingName;
      if (buildingAddress !== undefined && buildingAddress !== null) response.address = buildingAddress;
      return res.status(200).json(response);
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const { orderEmail, logo, smtp, paymentDetails, paymentMethods, emailTemplate, sharepoint, stripe, piq } = req.body || {};
      const cfg = await readConfig();
      if (orderEmail !== undefined) cfg.orderEmail = orderEmail;
      if (logo !== undefined) {
        if (KV_AVAILABLE) {
          // Store logo in its own Redis key so readConfig() never loads the large blob.
          await kvSet("tocs:logo", logo);
          // Remove logo from the main config object to keep it lean.
          delete cfg.logo;
        } else {
          // KV not available: fall back to storing in main config as before.
          cfg.logo = logo;
        }
      }
      if (smtp && typeof smtp === "object") {
        cfg.smtp = cfg.smtp || {};
        if (smtp.host !== undefined) cfg.smtp.host = smtp.host;
        if (smtp.port !== undefined) cfg.smtp.port = Number(smtp.port) || 2525;
        if (smtp.user !== undefined) cfg.smtp.user = smtp.user;
        if (smtp.pass !== undefined && smtp.pass !== "••••••••" && smtp.pass !== "") cfg.smtp.pass = smtp.pass;
      }
      if (paymentDetails  && typeof paymentDetails  === "object") cfg.paymentDetails  = { ...cfg.paymentDetails,  ...paymentDetails  };
      if (paymentMethods  && typeof paymentMethods  === "object") cfg.paymentMethods  = { ...cfg.paymentMethods,  ...paymentMethods  };
      if (emailTemplate  && typeof emailTemplate  === "object") cfg.emailTemplate  = { ...cfg.emailTemplate,  ...emailTemplate  };
      if (sharepoint && typeof sharepoint === "object") {
        cfg.sharepoint = cfg.sharepoint || {};
        if (sharepoint.tenantId   !== undefined) cfg.sharepoint.tenantId   = sharepoint.tenantId;
        if (sharepoint.clientId   !== undefined) cfg.sharepoint.clientId   = sharepoint.clientId;
        // Only update clientSecret if a real non-empty value is provided (not masked or blank)
        if (sharepoint.clientSecret !== undefined && sharepoint.clientSecret !== "••••••••" && sharepoint.clientSecret !== "") cfg.sharepoint.clientSecret = sharepoint.clientSecret;
        if (sharepoint.siteId      !== undefined) cfg.sharepoint.siteId     = sharepoint.siteId;
        if (sharepoint.folderPath  !== undefined) cfg.sharepoint.folderPath = sharepoint.folderPath;
      }
      if (stripe && typeof stripe === "object") {
        cfg.stripe = cfg.stripe || {};
        if (stripe.secretKey !== undefined && stripe.secretKey !== "••••••••" && stripe.secretKey !== "") {
          cfg.stripe.secretKey = stripe.secretKey;
        }
        if (stripe.publishableKey !== undefined) {
          cfg.stripe.publishableKey = stripe.publishableKey;
        }
      }
      if (piq && typeof piq === "object") {
        cfg.piq = cfg.piq || {};
        if (piq.baseUrl      !== undefined) cfg.piq.baseUrl      = piq.baseUrl;
        if (piq.clientId     !== undefined) cfg.piq.clientId     = piq.clientId;
        // Only update clientSecret if a real non-empty value is provided (not masked or blank)
        if (piq.clientSecret !== undefined && piq.clientSecret !== "••••••••" && piq.clientSecret !== "") {
          cfg.piq.clientSecret = piq.clientSecret;
        }
      }
      await writeConfig(cfg);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to save settings: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
