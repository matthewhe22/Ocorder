# TOCS OC Portal — Project Memory (CLAUDE.md)

## What this project is

**TOCS Owner Corporation Portal** — A Node.js + React SPA for ordering OC (Owner Corporation) certificates, managing strata plans, and administering orders. Built for TOCS (Top Owners Corporation Solution), an Australian strata management firm.

- **Live deployment:** Vercel (production)
- **Local dev:** `node server.js` on port 3000
- **Build:** `node build.mjs` → `dist/`

---

## Architecture

### Stack
- **Frontend:** React 18, no JSX transform — uses `React.createElement` via esbuild. All CSS, all components, and all JSX in a single file: `src/App.jsx`.
- **Backend:** `server.js` — vanilla Node.js HTTP server (no Express), ~750 lines. Handles REST API, file uploads, email sending, and serves `dist/`.
- **Data persistence:** `data.json` (orders + strata plans), `config.json` (admin creds, SMTP, settings).
- **Email:** nodemailer with SMTP (SMTP2GO).
- **Bundler:** esbuild via `build.mjs`.
- **Deployment:** Vercel (uses `api/` serverless functions for Vercel-specific features like Stripe, Redis).

> **Important:** The local `server.js` is the primary backend for this repo. The `api/` folder contains Vercel serverless functions that extend it in production (Stripe, Redis, SharePoint). When making backend changes, edit `server.js`.

### Key files
| File | Purpose |
|------|---------|
| `server.js` | Main HTTP server, REST API, email, auth |
| `src/App.jsx` | Entire React SPA (CSS + components + JSX) |
| `build.mjs` | esbuild bundler script |
| `data.json` | Live data: orders + strata plans |
| `config.json` | Admin credentials (plaintext — known gap), SMTP, settings |
| `uploads/` | Authority documents uploaded with orders |
| `dist/` | Built frontend (gitignored) — always rebuild before testing |
| `docs/CHANGELOG.md` | Running changelog, updated with every session |
| `docs/superpowers/plans/` | Implementation plans for past features |
| `docs/superpowers/specs/` | Design specs for past features |

---

## API Reference (server.js)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth` | — | Login: `{action:"login", user, pass}` → `{token}` |
| GET | `/api/data` | Optional Bearer | Public: strataPlans only. With valid token: full data incl. orders |
| POST | `/api/orders` | — | Place order (public). Recalculates total server-side. |
| PUT | `/api/orders/:id/status` | Bearer | Update order status (enum-validated) |
| GET | `/api/orders/:id/authority` | Bearer + `?token=` | Download lot authority document |
| POST | `/api/orders/:id/send-certificate` | Bearer | Send OC cert email with optional attachment |
| GET | `/api/orders/export` | Bearer or `?token=` | CSV export of all orders |
| POST | `/api/lots/import` | Bearer | Bulk import lots for a plan |
| POST | `/api/plans` | Bearer | Save full strata plans array (schema-validated) |
| GET | `/api/config/settings` | Bearer | Get config (SMTP pass masked) |
| POST | `/api/config/settings` | Bearer | Save config (partial merge) |
| POST | `/api/config/test-email` | Bearer | Send SMTP test email |
| POST | `/api/admin` | Bearer | Admin actions: `change-credentials` |

### Order status enum (enforced server-side)
```
Pending Payment | Processing | Issued | Cancelled | On Hold | Awaiting Documents | Invoice to be issued | Paid | Awaiting Stripe Payment
```

### Vercel-only API endpoints (api/ serverless functions)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/orders/:id/check-piq-payment` | Bearer | Manually poll PIQ ledger for one order; auto-links piqLotId if missing |
| POST | `/api/orders/:id/send-invoice` | Bearer | Send invoice email + set status to Pending Payment (re-reads fresh data before write) |
| POST | `/api/orders/:id/send-certificate` | Bearer | Send OC cert email with optional attachment |
| PUT | `/api/orders/:id/status` | Bearer | Update order status (enum-validated) |
| GET | `/api/orders/:id/authority` | Bearer/token | Download authority document |
| POST | `/api/orders/:id/stripe-confirm` | Public | Confirm Stripe payment (verifies session metadata) |
| POST | `/api/orders/:id/stripe-cancel` | Public | Cancel abandoned Stripe checkout |
| DELETE | `/api/orders/:id/delete` | Bearer | Delete cancelled order |
| GET | `/api/orders?action=poll-piq` | Cron/Bearer | Hourly cron: poll PIQ for all pending invoice keys orders |
| GET | `/api/orders?action=refresh-piq-payments` | Bearer | Re-poll paid PIQ orders to update paymentReference (date never overwritten) |
| POST | `/api/plans` (action=import-lots) | Bearer | Import lots from PIQ sync; back-fills piqLotId on existing orders |

---

## Data Structures

### Order
```json
{
  "id": "TOCS-XXXXXXXX-XXX",
  "date": "2024-03-25T12:00:00.000Z",
  "status": "Pending Payment",
  "payment": "bank | payid | stripe | invoice",
  "orderCategory": "oc | keys",
  "total": 220.00,
  "contactInfo": { "name": "", "email": "", "phone": "", "companyName": "", "ownerName": "", "applicantType": "agent|owner", "ocReference": "", "shippingAddress": {} },
  "items": [{ "productId": "", "productName": "", "price": 0, "ocName": "", "lotNumber": "", "lotId": "", "planId": "", "planName": "", "qty": 1, "managerAdminCharge": 0 }],
  "selectedShipping": { "type": "standard|express", "cost": 0 },
  "lotAuthorityFile": "TOCS-XXX-lot-authority.pdf",
  "lotAuthorityUrl": "https://sharepoint.../authority.pdf",
  "auditLog": [{ "ts": "", "action": "", "note": "" }],
  "piqLotId": 12345,
  "piqLastPolled": "2026-04-19T...",
  "piqLevyFound": true,
  "piqLevyTotalDue": 220.00,
  "piqLevyTotalNett": 0,
  "piqPaymentDate": "2026-04-19T...",
  "piqPaymentReference": "REC-001"
}
```

**PIQ fields note:** `piqPaymentDate` is set to server time on first confirmation only and never overwritten. `piqLotId` is auto-populated at order creation and back-filled when plan is synced from PIQ. Lot IDs in the plan are aligned to `piq-{piqLotId}` format after each PIQ sync.

### Strata Plan
```json
{
  "id": "SP12345",
  "name": "Harbour View Residences",
  "address": "45 Marina Drive, Sydney NSW 2000",
  "active": true,
  "lots": [{ "id": "", "number": "", "level": "", "type": "", "ownerCorps": ["OC-A"] }],
  "ownerCorps": { "OC-A": { "name": "", "levy": 0 } },
  "products": [{ "id": "", "name": "", "description": "", "price": 0, "secondaryPrice": 0, "turnaround": "", "perOC": true }],
  "keysShipping": { "deliveryCost": 0, "expressCost": 0 }
}
```

---

## Build & Run

```bash
# Install deps
npm install

# Build frontend
node build.mjs

# Run server (local)
node server.js
# → http://localhost:3000

# Default admin credentials
# username: info@tocs.co
# password: Tocs@Vote
```

---

## Known Gaps (Not Yet Fixed)

| Gap | Severity | Notes |
|-----|----------|-------|
| Plaintext passwords in config.json | High | bcrypt hashing deferred — larger refactor needed |
| No login rate limiting | Medium | Brute-force login possible |
| Sessions lost on server restart | Low | SESSIONS Map is in-memory only |
| SMTP password in settings response | Low | Masked in GET but still stored plaintext |
| Multiple concurrent sessions per user | Low | No session limit; changing password clears all via SESSIONS.clear() |
| Token lifetime not renewable | Low | 8h token, no refresh endpoint |
| config.json corruption at startup | Low | readConfig() falls back in-memory but doesn't rewrite the file |
| No audit trail for plan/lots import | Low | Destructive writes leave no log entry |
| PIQ payment reference often null | Low | PIQ ledger field name varies by tenant; reference may not be populated |
| poll-piq writes only on confirmed payment | Low | lastPolled not persisted when no payment found (prevents race, but lastPolled stale) |
| refresh-piq-payments endpoint still exists | Low | Backend endpoint retained even though UI button removed; harmless but unused |

---

## Development Conventions

- **No new files** unless absolutely necessary. All frontend changes go in `src/App.jsx`.
- **Rebuild after every change:** `node build.mjs` — check for `✅  Build complete → dist/`.
- **Branch for all changes:** create a new `claude/` prefixed branch per session.
- **Update `CLAUDE.md`** after each session with new session history row and any gap/API changes.
- **Commit messages:** use `fix:`, `feat:`, `chore:` prefixes. Be descriptive.
- **Email HTML:** Always use `esc()` helper for any user-supplied data inserted into HTML.
- **Status updates:** Always use the VALID_STATUSES enum in server.js.
- **Plans array:** Always validate with the plan schema check before saving (id + name required).

---

## Session History (high-level)

| Date | Changes |
|------|---------|
| 2026-03-15 | Initial design system overhaul (Editorial Luxury theme) |
| 2026-03-19 | Email & SharePoint stability fixes |
| 2026-03-20 | Stripe checkout, Privacy Policy, PII protection, order deletion |
| 2026-03-21 | Keys/Fob shipping, SP uploads for Stripe, email audit logging |
| 2026-03-22 | Stripe config UI, bug fixes (admin crash, SMTP test, keys cart) |
| 2026-03-23 | Admin email template editor, product save flow fixes |
| 2026-03-25 | Admin E2E round 1: fraud-proof total, plan schema validation, XSS escaping, status enum, null-safe send-cert, authority 404 disambiguation, input validation |
| 2026-03-25 | Admin E2E round 2: path traversal fix, order field whitelist, catalog-based item price validation, order ID format, file extension whitelist, lots deduplication, 413/405 responses, config validation |
| 2026-03-25 | Admin E2E round 3: CRLF server crash fix, authority file write-before-check, paymentDetails XSS in emails, order.id/lotAuthorityFile/orderEmail HTML escaping, email failure auditLog, orderEmail format validation |
| 2026-03-25 | Email subject tokens: add {buildingName}/{address}/{lotNumber} substitution; remove {total} from admin notification subject default and live config |
| 2026-03-25 | Manager Admin Charge field for keys/fob products: stored in plan catalog, snapshotted on order items server-side, exported in CSV (admin only — not shown to applicants) |
| 2026-03-25 | Admin E2E round 4: planId/productId enforcement, email format validation, control char stripping, lots id validation, dead /api/admin route removed, cert email XSS fix |
| 2026-03-25 | Admin E2E round 5: item/selectedShipping field whitelisting, order status on creation, CRLF in config, smtp.pass masking, {total} removed from default subject, /api/config/public parity, qty×price for keys |
| 2026-03-25 | Admin E2E round 6: admin username CRLF/length, product price type check, managerAdminCharge hidden from public, shipping in total, managerAdminCharge stripped from customer response, qty cap |
| 2026-03-26 | Admin E2E round 7: paymentMethods/logo config parity, secondaryPrice type validation, product id required, legacy order status migration, same-password rejection |
| 2026-03-26 | Security & bug fixes: reset-admin-password now clears sessions; CSV injection prefix; items array capped at 50; base64 authority file magic-byte + size validation (10 MB); server-time only for order dates; footer HTML-escaped in cert emails; CORS headers + OPTIONS preflight; login case-insensitive; crypto.randomBytes tokens; lots import audit log; invoice orders start as "Invoice to be issued"; CSV Content-Length header; frontend authority upload size error + hint |
| 2026-04-19 | PIQ payment race condition fix: send-invoice re-reads fresh Redis data before writing status; poll-piq cron only writes when payment confirmed (prevents stale snapshot overwriting Pending Payment). PIQ lot linkage: back-fill piqLotId on plan save; lot number normalisation (strip "Lot/Unit/Apt" prefix) across all 5 lookup sites; plan lot IDs aligned to piq-{piqLotId} format on sync; order.items[0].lotId updated during back-fill. PIQ payment date: use server time at first confirmation (PIQ ledger has no actual payment date field); payment date locked — never overwritten on subsequent checks. Manual PIQ Lot ID entry UI for orders with no auto-linked lot. Admin "Refresh PIQ Dates" bulk endpoint added (backend retained, UI button removed). |
