# TOCS OC Portal — Changelog

---

## 2026-06-23 — Prevent duplicate Owner Corporations on lot import

A PropertyIQ-imported building creates its Owner Corporations as
`OC-<piqScheduleId>` (e.g. OC-159, OC-160). The spreadsheet lot import,
however, minted brand-new ids by sheet position (`OC-1`, `OC-2`, …) and
assigned every lot to them — leaving buildings with duplicate OCs and lots
pointing at the wrong pair.

### Import now reconciles against existing OCs by name (src/App.jsx)
`importLotsFromFile` resolves each sheet/section to an OC id by **matching its
name (case-insensitive, whitespace-normalised) against the building's existing
Owner Corporations first**. Only when there is no match does it mint a fresh,
**non-colliding** id (lowest unused `OC-N`, instead of a position-based one
that collided with the PIQ ids). A repeated sheet name reuses the same id.

### Import confirmation shows the OC mapping (src/App.jsx)
Before writing, the confirm dialog now lists which sheets **matched existing
OCs** (`"Owners Corporation 1" → OC-159`) versus which will **create new OCs**,
so allocations are visible up front.

### Server-side backstop warning (api/plans.js, server.js)
`import-lots` now detects when an import would add brand-new OCs to a building
already linked to PropertyIQ (`piqBuildingId`, or any OC with `piqScheduleId`)
and returns a non-blocking `warning` — surfaced in the admin toast — so a
direct API caller or a name mismatch can't silently re-introduce duplicates.

### One-time data repair (scripts/fix-oc-allocation.mjs)
Added earlier: a dry-run-by-default, name-based migration that re-points lots
from placeholder OCs onto the canonical PIQ OCs and removes the orphans, for
buildings already affected.

## 2026-06-10 — Performance pass 4: per-order Redis keys replace the monolithic blob

Final batch from the multi-agent speed review — removes the long-term
scalability ceiling on the Vercel deployment.

### Split storage layout in api/_lib/store.js (High, strategic)
The entire dataset previously lived in ONE Redis JSON blob (`tocs:data`):
every request read, parsed, and often rewrote every order ever placed (with
their growing audit logs) — O(all orders) per request, with concurrent
writers clobbering each other. The store is now split:

- `tocs:plans` — strataPlans array (changes rarely)
- `tocs:order-ids` — order id index, newest first
- `tocs:order:{id}` — one key per order

`readData()`/`writeData()` keep their whole-dataset signature so **every
handler works unchanged**, but `writeData` now diffs against the snapshot
taken at read time and writes only the orders that actually changed — a
status update touches one small key instead of re-serialising the entire
order history. Reads assemble via a single MGET. Index updates merge with
the live index under a short lock, so two instances creating orders
concurrently no longer lose each other's writes (verified by test).

### Migration + rollback safety
The legacy blob is split automatically on first read (idempotent, guarded
by a migration lock against double-running cold starts) and preserved under
`tocs:data:pre-split` for manual rollback. Demo namespaces (`demo:*`) get
the same treatment.

### New store helpers
- `readOrder(id)` — single-key fast path; the public `/track` endpoint now
  does one GET instead of assembling the whole dataset.
- `replaceData(d)` — replace-ALL semantics for `/api/demo/reset` (the
  diff/merge in writeData would otherwise preserve orders the reset is
  meant to wipe).
- `kvMGet`, generalised `withLock` (order locks unchanged).

7 new tests run the real store against the file-KV fallback: legacy
migration, diff-writes (a concurrent update by another instance is NOT
clobbered by our stale copy — strictly better than the old blob), index
merge under concurrency, deletion, replaceData, readOrder, round-trip.

---

## 2026-06-10 — Performance pass 3: plan summaries, per-building fetch, instant portal shell

Third batch from the multi-agent speed review — the public payload no longer
grows with the portfolio.

### Public /api/data returns plan summaries only (High)
Anonymous visitors previously downloaded **every lot, product, and owner
corporation of every building** on first paint — the startup-blocking payload
grew linearly with the portfolio. The public response is now constant-size
summaries (`id`, `name`, `address`, `active`, `lotCount`, `ocCount`); the
search step needs nothing more. Side benefit: lots/products are no longer
exposed wholesale to anonymous scrapers. Authenticated admins still get full
data, and `handleAuth` already refetches with the token on login. Parity
maintained across `server.js` and `api/data.js`.

### New: GET /api/plans?id=SP12345 (public, both backends)
Returns the full catalog for ONE building (admin-only product fields
stripped, inactive plans 404). The portal fetches this when the customer
selects their building — `selectPlan` merges the detail into state *before*
`selPlan` is set, so every downstream wizard step sees a complete plan
exactly as before. The clicked card shows an inline "Loading building…"
spinner; failures toast and stay on search. Admin sessions skip the fetch
(plans already full in memory).

### Portal shell renders instantly (High)
The global `appLoading` gate that replaced the entire app with a spinner
until `/api/data` + `/api/config/public` both resolved is gone. The step-1
hero, search box, "How it works", and order tracking are static and now
paint immediately; only the building-search results show a loading state
while plans arrive. Admin keeps a gate (it genuinely needs the dataset).

Also: hoisted a single global `@keyframes spin` into the main stylesheet.

---

## 2026-06-10 — Performance pass 2: server data cache, admin URL state, UI responsiveness

Second batch from the multi-agent speed review (structural tier).

### In-memory data/config cache in server.js (High)
`readData`/`readConfig` previously did a synchronous full-file read +
`JSON.parse` on every call (~40 call sites, multiple per request) — blocking
the event loop with work that grows with order count. Both now cache the
parsed object keyed on file mtime and hand out `structuredClone` snapshots,
so existing read-modify-write semantics are preserved exactly. `writeData`/
`writeConfig` refresh the cache from the just-written object. Measured:
`/api/data` 10.9 ms → 1.3 ms per request.

### Admin view/tab survive refresh via URL hash (High, admin UX)
`#admin/<tab>` is mirrored into the URL (replaceState — no extra history
entries to fight the wizard's back-button handling). Refreshing or
bookmarking while in Admin now lands back on the same tab instead of
resetting to the customer portal.

### Optimistic modals close immediately (Medium)
All 8 plan/product/lot/OC CRUD modals awaited the network round-trip before
closing, with no pending indicator — inviting double-clicks that created
duplicate products (`Date.now()` ids). Since `savePlans` already applies
changes optimistically with rollback + toast on failure, the modals now
close instantly and the save settles in the background.

### Save buttons get busy states (Medium)
Email-, Payment-, and Storage-settings Save buttons had no disabled/spinner
state (nothing visibly happened until the round-trip finished). All three
now use the same `saving` spinner pattern as BrandingTab and ignore repeat
clicks while in flight.

### Render-cost fixes (Medium)
- The `Ic` icon component built all ~30 SVG element trees on every render
  (tables render hundreds of icons) just to return one. Icons are now
  factories — only the requested icon's tree is constructed.
- The lot-search dropdown rendered every lot of a building (1000+ for large
  plans, re-rendered per keystroke). Capped at 50 rows with a "keep typing
  to narrow down" hint.
- The cart/contact localStorage mirror ran a synchronous stringify+write on
  every keystroke in the checkout form; now debounced at 300 ms.

---

## 2026-06-10 — Performance pass: build fix, bundle splitting, response latency

First batch from the multi-agent speed review (frontend, backend, UI/UX).

### Production build unbroken (Critical)
`node build.mjs` failed outright on esbuild 0.27: the `safari13` target
requires a destructuring lowering esbuild doesn't implement (Safari ≤ 14.0
engine bug). Target floor raised to `safari14.1` / `es2020` — the build (and
therefore Vercel deploys) works again.

### Bundle splitting — main bundle halved (High)
Build now emits ESM with code splitting and content-hashed filenames.
`xlsx` (423 KB, admin-only Excel import/export) was being inlined into the
single bundle every visitor downloaded despite the lazy `await import("xlsx")`
in App.jsx. Main bundle: 920 KB → 488 KB raw (279 KB → 138 KB gzipped); xlsx
loads on demand as its own chunk. Hashed names mean unchanged code stays
cached across deploys (previously `?v=Date.now()` busted cache every build).

### Font loading off the JS critical path (High)
Google Fonts were loaded via `@import` inside the JS-injected CSS string —
fonts couldn't start downloading until the bundle was parsed and React had
rendered. Now `<link rel="preconnect">` + `<link rel="stylesheet">` in
index.html, parallel with the bundle.

### gzip in server.js (High, self-hosted deploys)
Static assets and JSON API responses > 1 KB are gzip-compressed when the
client accepts it (~3–4× transfer reduction on the bundle and `/api/data`).
Compressed static bodies are cached in memory keyed on file mtime.

### Emails off the customer's critical path (High)
- `server.js` order creation awaited both SMTP sends (~6+ s with SMTP2GO)
  before returning 201 — now detached; failures still land in the order's
  auditLog and `emailDeliveryStatus` via a fresh read-modify-write.
- `stripe-confirm` (the post-payment redirect) awaited admin + customer
  emails before responding — now deferred via the same `waitUntil` pattern
  as order creation on Vercel; awaited after the response off-Vercel.

### Serverless cold-start weight (Medium)
`pdfkit` (embedded font data), `@azure/identity` (MSAL tree), and `stripe`
are now lazy-loaded at point of use instead of at module scope, so hot public
routes served by the merged handlers (e.g. `/track`) stop paying for them.

### Misc request-path savings (Medium)
- AAD Graph tokens cached at module scope per tenant/client (~0.3–0.8 s saved
  per SharePoint file; an order uploads up to 3 files).
- Order POST: `readConfig`/`readData` fetched in parallel; body-size cap
  checked via `Content-Length` instead of re-`JSON.stringify`ing a payload
  that can be 10 MB+ of base64.

---

## 2026-06-01 — Security pass (cont.): plan-save parity, audit log, error hygiene

Second batch from the review backlog.

### Plan-save validation parity (Medium)
`POST /api/plans` now matches `server.js`: validates `managerAdminCharge` is a
non-negative number, restricts `externalUrl` to Keys/Fobs products (http/https,
≤ 2048 chars), and deduplicates plans by id (last occurrence wins) before
persisting. Previously production accepted plan arrays the local backend
rejected and could store duplicate-id plans.

### Config-change audit trail (Medium)
`writeAuthAudit` moved to `api/_lib/store.js` as the single source of truth
(was local to `auth/index.js`). `POST /api/config/settings` now records a
`config-updated` audit entry — actor, IP, which sections changed, and whether a
secret was rotated — so a config rewrite via a stolen bearer is traceable.

### Error-message hygiene (Low)
Public-facing 500s no longer echo internal exception text: order creation
(`api/orders/index.js`) and the settings save (`api/config/settings.js`) now
return generic messages and log the detail server-side. (Admin-only diagnostic
endpoints still surface the underlying error, which is useful and trusted.)

### Upload OOM guard (Low)
The hand-rolled multipart reader in `api/orders/[id]/[action].js` now caps the
buffered body at 5 MB during streaming, so an oversized `send-certificate` /
`send-invoice` upload can't exhaust memory before the per-attachment size check.

### Tests
- `api/plans.test.js` — rejects bad `managerAdminCharge`, rejects `externalUrl`
  on an OC product, accepts it on keys, dedups plans by id.
- `api/config/settings.test.js` — a config save writes a `config-updated` audit
  entry with the actor and a "secrets changed" note.

### Still open
Config-write **password re-confirmation** (`verifyActor`) — deferred because it
requires a frontend change (prompt for current password on the settings page).

## 2026-06-01 — Security pass (token scoping, PII exposure, upload & import hardening)

Follow-up hardening from the multi-agent review.

### Service token scoped to read-only (High)
`SERVICE_API_TOKEN` (the static server-to-server integration token) was accepted
by `validToken()`, which also gated mutating endpoints — so a leaked read-only
integration token could replace all strata plans, overwrite SMTP/Stripe/
SharePoint/PIQ secrets, or change/delete orders.
- New `validAdminToken()` in `api/_lib/store.js` accepts ONLY a human admin's
  HMAC session token (rejects the service token).
- Mutating endpoints now gate on `validAdminToken`: `POST /api/plans`
  (save + import-lots), `POST /api/config/settings` (GET + POST), and the order
  `status`/`amend`/`delete`/`send-certificate`/`send-invoice`/`notify`/
  `save-to-sharepoint`/`check-piq-payment` actions. Read endpoints
  (`/api/data`, CSV export, authority/certificate downloads, PIQ status) keep
  `validToken`, so the read-only integration still works.

### managerAdminCharge no longer exposed (Medium)
The internal admin-only `managerAdminCharge` figure was returned in the public
`GET /api/data` catalog and echoed back in the order-creation response.
- `api/data.js` strips it from products for non-admin callers.
- `api/orders/index.js` strips it from the order echoed to the customer (the
  stored order keeps it for CSV/admin).

### Authority upload magic-byte validation (Low)
`api/orders/index.js` validated only the MIME string + size; it now also checks
the decoded file's magic bytes match the declared type (parity with
`server.js`) — a mislabelled/garbage blob can no longer be stored as a "PDF".

### Lot import field whitelist (Medium)
`POST /api/plans` `import-lots` spread `...incoming` into new lots, letting an
importer inject arbitrary fields — most dangerously a forged `piqLotId` (which
drives PIQ payment matching). New lots are now built from a fixed whitelist;
`piqLotId` is never accepted here (set only by the trusted PIQ sync).

### Tests
- `api/_lib/admin-token.test.js` — service token accepted by `validToken`,
  rejected by `validAdminToken`; admin session accepted by both.
- `api/data.test.js` — `managerAdminCharge` stripped for non-admin, kept for admin.
- `api/plans.test.js` — forged `piqLotId`/arbitrary fields dropped on import.

### Still open (not in this pass)
Config-write password re-confirmation + audit log (needs frontend coupling);
generic error messages (several handlers still echo `err.message`); plan-save
parity (`managerAdminCharge` type / `externalUrl` OC restriction / plan dedup);
multipart body streamed-size cap.

---

## 2026-06-01 — Secondary-OC discount now derived server-side (anti under-pay)

For a per-OC certificate ordered across multiple Owner Corporations, the first
OC pays the primary rate and additional OCs get the discounted `secondaryPrice`
(a volume discount). The production handler chose the rate from the client's
`isSecondaryOC` flag, so a crafted request could claim the discount on a primary
(or single) OC and under-pay.

### Change
- `api/orders/index.js`: the discount is now derived **server-side** — per perOC
  product the first line is charged the primary rate and each additional line
  the `secondaryPrice`, ignoring the client flag. Each submitted line price must
  still equal one of the two catalog rates (anti-tamper); the server decides
  which one applies and the existing total check rejects any mismatch.
- `OCOrder/src/App.jsx`: removing a per-OC line from the cart now re-derives the
  remaining lines (first = primary, rest = secondary) so the displayed/submitted
  total matches the server — otherwise removing the only primary-rate OC would
  leave a secondary-priced lone line and the order would be rejected as an
  invalid total.
- Regression tests: `api/orders/oc-pricing.test.js` (accepts primary+secondary;
  accepts a lone primary; rejects a lone OC claiming secondary, both-secondary
  under-pay attempts, and off-catalog prices).

---

## 2026-06-01 — Review fixes: amend shipping loss + background write race

Follow-up fixes from a multi-agent code review of the order flow.

### Amend silently dropped keys-order shipping (High)
Customer keys orders persist the shipping amount as `selectedShipping.cost`
(the field the PDF, emails, and customer summary all read), but the amend
handler read and rebuilt only `.price`. Amending any customer keys order
therefore computed shipping as $0 — dropping it from the new total and
overwriting the stored `.cost` with `{ price: 0 }`, so the PDF/email then showed
shipping as $0.00.
- `api/orders/[id]/[action].js`: accept `cost ?? price` and persist BOTH fields
  so every consumer agrees.
- `OCOrder/src/App.jsx`: the Amend modal's displayed total now reads
  `cost ?? price` too.
- Regression test: `api/orders/[id]/amend-shipping.test.js`.

### Background write race could lose audit rows / SharePoint URLs (Medium)
After the response-latency change, the SharePoint-result write and the
email-failure audit write run concurrently, each doing an unlocked
read-modify-write on the same order — last writer wins, dropping the other's
audit entries or `lotAuthorityUrl`/`summaryUrl`.
- `api/orders/index.js`: both background read-modify-writes now run inside
  `withOrderLock(order.id, …)` so they serialise. On SP-result read failure the
  write is skipped rather than persisting the stale pre-save snapshot (which
  would have reverted other writers' rows).

---

## 2026-06-01 — Order submission response cut from ~7 s to sub-second

Placing an order made the customer wait ~7 s for the "order confirmed" screen.
The Vercel handler `api/orders/index.js` blocked the HTTP response on two
best-effort operations: confirmation emails (~6.6 s via SMTP2GO on port 2525)
and SharePoint uploads (~5 s via Graph API). The order itself is durably
persisted to Redis *before* either runs, so neither is part of the customer's
critical path.

### Change
- **Defer best-effort work via `waitUntil`.** Emails and SharePoint uploads are
  now handed to `waitUntil` from `@vercel/functions`, which keeps the serverless
  invocation alive until they settle *after* the response is flushed. The
  customer gets `{ ok: true }` in well under a second; emails/SP complete in the
  background exactly as before.
- **Safe fallback.** `waitUntil` only keeps work alive inside a real Vercel
  request scope, so the deferral is gated on `process.env.VERCEL`. Off-Vercel
  (local `server.js` flow, tests) the work is awaited inline so nothing is ever
  silently dropped. The email block was refactored from an inline `await` into a
  non-blocking `emailPromise`; failure → audit-log behaviour is unchanged.
- **Fewer Redis round-trips.** The plan catalog (`readData()`) was read twice on
  keys orders (piqLotId lookup + price reconciliation); it is now read once and
  reused, since the store is not mutated between the two read-only lookups.

### Notes / risk
- Relies on Vercel **Fluid Compute** (default since 2025) to finish background
  work after the response. If Fluid Compute were disabled, deferred emails could
  be cut short — order data is unaffected (already persisted). Added
  `@vercel/functions` as a dependency.

### Verified
- New `api/orders/waituntil.test.js`: with `VERCEL=1` the handler returns 200
  even when the email send never resolves (proving it does not block on it) and
  registers the work with `waitUntil` once; without `VERCEL` it awaits inline and
  does not respond until the work settles. Full suite: 57 tests passing; handler
  lints clean (no new warnings).

---

## 2026-06-01 — Multi-quantity keys/fob orders rejected with "Invalid total"

Submitting a keys/fob order with a quantity greater than one was rejected at
checkout with `Invalid total: expected $440.00 (received $220.00).` — for
example 2× Garage Remote at $110 each. The displayed/charged total ($220) was
correct; the server's reconciliation was double-counting quantity.

### Root cause
The cart stores `item.price` as the **line total** (unit × qty) — see
`src/App.jsx` where the increment/decrement controls set
`price: product.price * qty`, and the order total is summed as
`cart.reduce((s, i) => s + i.price, 0)`. The Vercel order handler
`api/orders/index.js` trusted the client price for keys orders but then
multiplied it by `qty` a **second** time
(`recomputedItemsTotal += item.price * qty`), so a $220 line total recomputed
to $440 and failed the `Math.abs(recomputedTotal - order.total) > 0.01` check.
The local `OCOrder/server.js` backend was already correct — it overrides
`item.price = product.price * qty` and then sums the line totals without
re-multiplying — so the two backends had diverged. (Introduced by the
2026-03-25 "round 5: qty×price for keys" change, which assumed `item.price`
was a unit price.)

### Fix
- `api/orders/index.js`: for keys orders, add `item.price` directly to
  `recomputedItemsTotal` (it is already the qty-inclusive line total). This
  matches both the frontend total computation and the local `server.js`
  backend. OC orders are unaffected (per-OC line items remain qty 1).

### Verified
- New `api/orders/index.test.js` regression suite: a 2× keys order with total
  $220 now succeeds and the server-recomputed total is $220; a single-qty
  order succeeds; a tampered total is still rejected with the correct expected
  amount. Re-introducing the `* qty` bug makes the suite fail. Full suite: 55
  tests passing.

---

## 2026-05-13 — Send Certificate failing on mobile Safari with attached file

Sending an OC certificate from an iPhone/iPad rejected the request with `Attach at least one certificate file before sending.` even when a PDF had been attached. The frontend was uploading the file correctly; the Vercel handler dropped it during multipart parsing.

### Root cause
`readMessageAndAttachments` in `api/orders/[id]/[action].js` lowercased the entire `Content-Type` header before extracting the boundary. Multipart boundaries are case-sensitive, and mobile Safari sends boundaries like `----WebKitFormBoundaryAbCdEf` — once lowercased, the boundary string no longer matched the actual delimiter bytes in the body, so the parser found zero parts and `attachments` came back empty. The backend then 400'd with the "attach at least one" message.

### Fix
- Keep the raw `Content-Type` value for boundary extraction; only the lowercased copy is used for the `multipart/form-data` type check. The local `OCOrder/server.js` parser was already case-preserving and not affected.

### Verified
- Reproduced the empty-parse failure with a `----WebKitFormBoundaryAbC` payload and a lowercased CT; same payload with the raw CT now yields `{ fields: { message }, files: { file } }`.

---

## 2026-05-13 — Local server now mounts the missing Vercel-handler routes

The end-to-end review's last remaining backlog item: `OCOrder/server.js` was missing handlers for `stripe-confirm`, `stripe-cancel`, `stripe-webhook`, `save-to-sharepoint`, `check-piq-payment`, `poll-piq`, and `refresh-piq-payments`. Dev couldn't exercise those flows at all — every PR touching them was deploy-tested only.

### Fix
- **`callVercelHandler()` adapter** in `OCOrder/server.js` shims `res.status()`/`res.json()`/`res.send()`/`res.redirect()` + `req.body`/`req.query` onto Node's raw HTTP shapes so the existing Vercel handlers run unchanged. `opts.parseBody: false` skips the JSON parse for the Stripe webhook, which reads the raw stream itself.
- **The 7 missing routes** now delegate directly to `api/orders/[id]/[action].js`, `api/orders/index.js`, or `api/stripe-webhook/index.js` — no duplicated logic, no drift.
- **`LOCAL_KV_DIR` file-based KV fallback** added to `api/_lib/store.js`: when set, `kvGet/kvSet/kvDel` read/write one JSON file per key under that directory (TTL recorded as a sidecar field, honoured lazily on read). Lets the Vercel handlers persist state locally without Redis. Falls back to the existing no-op semantics when neither `LOCAL_KV_DIR` nor `REDIS_URL` is set.

### Verified
- `POST /api/orders/:id/save-to-sharepoint` with a fake bearer → 401 (handler rejected token)
- `POST /api/orders/:id/stripe-cancel` with unknown id → 200 (idempotent path)
- `POST /api/stripe-webhook` without `STRIPE_WEBHOOK_SECRET` → 503 (signature gate)
- `GET /api/orders?action=poll-piq-status` without admin token → 401

### Out of scope
The local server's existing `data.json` / `config.json` (sync `readData/writeData`) and `api/_lib/store.js`'s readData (async) target separate stores by default. Set `REDIS_URL` or accept that the delegated routes don't share state with the legacy local data file unless storage is unified — a separate refactor.

---

## 2026-05-13 — Medium + Low tier sweep: input validation, race/idempotency, a11y, secret cleanup

Eighteen items from the end-to-end review backlog, batched into one PR.

### Input validation / crash guards
- **`/track` no longer crashes on missing id** — guard added before `toUpperCase()`; explicit 400 returned when the order reference is empty.
- **`piqLotId` validator** now requires `Number.isInteger > 0` (was `Number.isFinite`, which accepted floats and 0).
- **Logo upload validated at `/api/config/settings` POST** — 256 KB cap, `data:image/(png|jpe?g|gif|webp|svg+xml);base64,…` MIME check. Stops an authenticated admin (or stolen-token attacker) planting arbitrary content reflected to every visitor via `/api/config/public`.
- **Authority-filename ext parser** rewritten to a strict allow-list (`pdf|jpg|jpeg|png`); filenames ending in `.` or with weird characters no longer produce empty / odd extensions.

### Security hardening
- **Stripe-webhook raw body capped at 1 MB** with early-abort + 413 response, so an attacker who knows the URL can't stream unbounded data before the signature check.
- **`clientIp` XFF fallback gated behind `TRUST_XFF=1` env var** — non-Vercel deployments no longer silently trust attacker-controllable XFF for rate-limiter buckets.
- **Email-failure audit entries now use the `note` field for error text**, not the `action` field. Defence in depth against stored-XSS if any UI path ever skipped `esc()` (action is rendered more prominently).
- **`DEMO_DEFAULT_CONFIG` no longer ships the well-known `Demo@1234` password by default** in production-style configs — sourced from `DEMO_ADMIN_PASS` env var; the literal placeholder only applies on the dedicated demo deployment.
- **`/api/config/settings` GET no longer pre-fills the well-known default SharePoint folder name** — runtime fallback still applies, but the admin sees an empty field and chooses explicitly.

### Correctness / race
- **`POST /api/orders` now awaits `spPromise` before responding** — same Vercel "no post-response execution" fix as the webhook (PR #36). Without this, audit log entries written after `res.end()` were silently dropped on cold starts.
- **Graph API timeout** reduced from 8s × 2 sequential (= 16s, > Vercel 10s limit) to **4.5s × 2 = 9s**. A slow Graph response now surfaces as a recoverable upload failure, not a function timeout that kills the surrounding handler.
- **PIQ lot-prefix normaliser deduplicated** to `normaliseLotNumber()` in `api/_lib/constants.js`. Previously two near-identical inline copies — `api/orders/index.js` (cron) and `[id]/[action].js` (single-order check) — had already drifted on edge cases like "Apartment 5" vs "Apt 5".

### Frontend UX
- **PIQ payment panel `checkNow` handles 401 and 429** distinctly, surfacing "Session expired" / "Too many PIQ checks" instead of burying them inside the generic `checkResult.error`.
- **`SettingsTab` now refreshes `pubConfig`** after saving SMTP/email template settings (matches the `StorageTab` pattern), so any pubconfig-mirrored field (logo, sharepointEnabled, ...) updates immediately rather than after a page reload.
- **`/track` polling adopts `AbortController`** — rapid clicks no longer race on the last-resolved (not last-clicked) result. Also surfaces `429` distinctly.
- **401 toasts on the remaining admin handlers** — `fetchPiqPollStatus`, `openPiqSync`, `importLotsFromFile`, `loadAdmins` now dispatch `tocs:auth-fail` on a stale-session response instead of silently returning empty data.

### Accessibility
- **`aria-hidden="true"` on every decorative spinner** (~17 sites). Screen readers no longer announce the animated glyph; the surrounding "Saving…" / "Sending…" / "Processing…" text remains the announced state.

---

## 2026-05-13 — High-tier hotfix: rate limits, TLS hardening, PIQ idempotency, status enum dedup

Eleven High-tier findings from the end-to-end review pass, all landed in a single PR.

### Security
- **`send-invoice` 4.5 MB attachment cap** mirrors `send-certificate`. Without this an admin (or stolen-token attacker) could OOM the function or burn SMTP quota with a single oversized upload. (`api/orders/[id]/[action].js`)
- **Host-header injection closed** on the Stripe success/cancel URLs. `req.headers.host` is fallback-only; the canonical origin comes from `PUBLIC_ORIGIN` env var (or `cfg.publicOrigin`). A tampered `Host:` no longer routes paying customers to `attacker.com/complete?…` after Stripe. (`api/orders/index.js`)
- **TLS verification enabled by default** for both SMTP (`api/_lib/email.js`, `OCOrder/server.js`) and Redis (`api/_lib/store.js`). `rejectUnauthorized: false` removed; operators on private SMTP / Redis with self-signed certs can opt in with `SMTP_ALLOW_INSECURE_TLS=1` or `REDIS_ALLOW_INSECURE_TLS=1`.
- **Order-POST DoS bounded** — unauthenticated `POST /api/orders` is now rate-limited (5 orders/min/IP) and the body is capped at 12 MB. Stops a single IP from inflating `tocs:data`, burning SMTP quota, filling SP folders, or starving the function pool.
- **Admin-mutation rate limit** — `add-admin` / `remove-admin` / `reset-admin-password` capped at 20 req/min/IP. Defence in depth alongside `currentPass` + `tocs:auth-audit` (added in PR #39).

### Correctness
- **PIQ poll cron always persists `piqLastPolled`** — previously discarded on "no payment found" runs, so the admin UI was stuck on a stale poll timestamp for any order without a payment. Cron now re-reads fresh and merges only PIQ-related fields + the audit entries this run actually appended (`_auditStartLen` snapshot), so the always-write doesn't clobber concurrent send-invoice / status changes.
- **PIQ payment email idempotency** — new `piqPaymentEmailSent` flag set after the admin notification email succeeds, checked at the top of the email path. A failed `writeData` after the email goes will let the next cron re-detect and re-send (small known duplicate risk) but the common case no longer double-emails.
- **`pushAuditOnce` coverage extended** to all SP-failure paths: `stripe-confirm`, `amend`, `send-certificate`, plus the order-creation IIFE. A persistently broken SharePoint can no longer flood the audit log with hundreds of duplicate "SP upload failed" rows per day.
- **Webhook opportunistic-SP per-doc gating** — mirrors `save-to-sharepoint`: skip any doc whose URL is already populated. Without this, a Stripe webhook retry would re-upload `order-summary.pdf` even when an earlier run had already saved it, appending a duplicate "Order summary saved" audit row.

### Quality / cleanup
- **Status enum centralised** in new `api/_lib/constants.js` and imported by both the Vercel handlers and the local dev server. Previously redefined in 4 places; drift between dev and prod is no longer possible.
- **Delete double-click guard** — order-delete button now disables on the in-flight row and shows "Deleting…". A `deletingOrderId` scalar mirrors the existing `savingToSp` pattern.

---

## 2026-05-13 — Critical hotfix: order pricing, stripe-cancel, SP filename, admin takeover, order lock coverage

Five Critical findings from an end-to-end review pass over main.

### C1 — Server-side `total` / `item.price` reconciliation (`api/orders/index.js`)
Order creation trusted the client-supplied `total` and per-item `price`. Stripe was gated on `total > 0` but bank/payid/invoice paths happily saved `total: 0`. New reconciliation phase looks up each item's `productId` against the plan catalog, computes the expected unit price (honouring `secondaryPrice` for additional-OC items), validates the total within 1¢, and rewrites `order.total` to the server-computed value. Keys orders are special — `product.price = 0` by design — so we only enforce non-negative invariants there.

### C2 — `stripe-cancel` now requires Stripe session-id proof + rate limit (`api/orders/[id]/[action].js`, `OCOrder/src/App.jsx`)
The endpoint was public + unauth'd; any unauthenticated client who guessed an order id could flip a pending Stripe checkout to `Cancelled`. Stripe cancel-redirects now carry `{CHECKOUT_SESSION_ID}` in the URL; the frontend reads it from `?session_id=` and posts it back; the server compares it against the stored session id with a constant-time check, and rate-limits the endpoint (20 req/min/IP).

### C3 — `lotAuthority.filename` sanitised at direct `uploadToSharePoint` call sites
The `sanitiseSegment` fix from PR #36 only covered `uploadOrderDocs`. Two older direct callers in `api/orders/index.js` and `stripe-confirm` (`[id]/[action].js`) still concatenated the raw client filename — `../../evil.pdf` would have escaped the order folder under Graph's path API. Both now run `sanitiseSegment` first; the helper is exported for reuse.

### C4 — Admin mutations require `currentPass` + audit trail (`api/auth/index.js`, `OCOrder/src/App.jsx`)
`add-admin`, `remove-admin`, `reset-admin-password` previously only checked `validToken`. A stolen 8-h bearer in localStorage was enough to take over the whole admin pool with no audit trace. Each handler now requires the actor's current password (verified via the decoded token's username → admins record) and writes a structured entry to a new `tocs:auth-audit` Redis list (last 500 events). `change-credentials` writes the same audit entry. Self-removal is also blocked — pulling out your own account via a single stolen-token vector is no longer the easy path. The shared `appConfirm` dialog grew a `passwordPrompt` mode (resolves with the entered string, or `null` on cancel) so the three call sites can prompt without bespoke modals.

### C5 — `withOrderLock` coverage extended to 6 audit-mutating handlers (`api/orders/[id]/[action].js`)
`check-piq-payment`, `notify`, `delete`, `send-cert`, `send-invoice`, `amend` all did `readData → mutate auditLog/fields → writeData` without holding the order lock, so a concurrent hourly PIQ poll + admin click would silently lose updates. Each handler now wraps the *persistence* boundary in `withOrderLock` (external I/O — SMTP, Graph, PIQ — runs outside the lock so the 10s TTL is plenty). `check-piq-payment` got a `persistPiqChanges` helper that merges only the PIQ-related fields + the audit entries appended during the call into a fresh-read, so concurrent state isn't clobbered. `delete` is now lock-wrapped end-to-end and returns 503 on contention.

---

## 2026-05-13 — Hotfix round: login XFF spoofing, /certificate open-redirect, x-vercel-forwarded-for direction

Findings from a third agent review pass over the previous three rounds.

### High (real defects)
- **Login rate-limiter still used leftmost-XFF** (`api/auth/index.js`). The tier-3 round updated `clientIp()` in `_lib/store.js` but missed this older inline call site. An attacker could defeat the 10-attempts/15-min lockout by rotating `X-Forwarded-For` per request. Now uses the shared `clientIp()` helper.
- **`GET /api/orders/:id/certificate` JSON path skipped `isAllowedRedirectHost`** (`api/orders/[id]/[action].js`). The symmetric `/authority` endpoint validated the SharePoint host before exposing the URL; this one didn't. A corrupted `certificateUrl` would have become a phishing primitive when the admin client opened it in a new tab. Now mirrors `/authority`: 502 if the host isn't on the allow-list.
- **`x-vercel-forwarded-for` direction was wrong** (`api/_lib/store.js`). I used `.pop()` (rightmost) for both XFF and `x-vercel-forwarded-for`, but per Vercel's docs the *leftmost* entry of `x-vercel-forwarded-for` is the originating client (Vercel's own hops, if any, are appended to the right). `.pop()` rate-limited the wrong IP. Now uses `[0]` for `x-vercel-forwarded-for`; `.pop()` remains correct for the XFF fallback.

### Medium
- **`sanitiseSegment` now strips soft hyphen (U+00AD) and the Unicode Tags plane** (`api/_lib/sharepoint.js`). Soft hyphen is the classic invisible-in-rendered-text spoof; Tags are invisible by design. NFKC normalisation still runs first.
- **`parseContentDispositionFilename` strips path separators + leading dots** from the parsed filename (`OCOrder/src/App.jsx`) before assigning to `a.download`. Browsers also sanitise this, but mirroring the server-side policy keeps the chain consistent.
- **Legacy `filename=` regex anchored** to `(?:^|;)\s*filename=` so a malformed `filename*=` token can't be mis-parsed as `filename=`.
- **`pubConfig` refresh now checks `rr.ok`** (`OCOrder/src/App.jsx`). A 500 from `/api/config/public` no longer clobbers `sharepointEnabled` with `undefined`; logs a `console.warn` on failure so ops can diagnose.

### Low
- **`aria-hidden="true"` on the new Save-to-SharePoint spinner glyph** — paired with the existing `aria-busy` on the button so screen readers announce "busy" without also reading the decorative glyph.

---

## 2026-05-13 — Cosmetic / leftover polish round

Cleared the remaining items from the review backlog.

- **TTL mismatch documented** between `writeAuthority` (90 d) and `writeCertificate` (365 d) — by design (KV is a hot cache, SharePoint is canonical for both), but the asymmetry was undocumented and surprising.
- **`URL.createObjectURL` revocation tightened** — the previous `setTimeout(..., 1000)` fired regardless of component lifecycle and held the blob in memory unnecessarily. Now revokes on the next macrotask (after the browser has scheduled the synthetic-click download), inside a `try/finally`.
- **RFC 5987 `filename*=` parser** added to `streamResponseAsDownload` — SharePoint and some Graph endpoints emit this form for non-ASCII filenames; the previous parser fell back to a generic `certificate-<id>.pdf` for those.
- **401 toast pattern propagated** to `updateOrderStatus` (and therefore `markPaid` / `markPending` via the shared handler), the order delete flow, and the amend handler. Pattern now matches `downloadCertificate` / `openAuthorityDoc` / `saveOrderToSharePoint` (added in earlier rounds).
- **SP-disabled log line** in the Stripe webhook so ops can grep Vercel logs for "SP archival skipped for `<orderId>`" without having to cross-reference the order's audit log to see why a folder is missing.
- **Rate-limit keyed on token-hash as well as IP** for `save-to-sharepoint` — defence in depth. A token leaked across many IPs is now bounded (token-hash bucket), and an admin IP behind a NAT shared with another admin is no longer eaten by the other admin (IP buckets are separate). Either limit tripping returns 429 with the longer `Retry-After` of the two.

---

## 2026-05-13 — Polish tier: tenant lockdown, button accessibility, toast wording, content-type sniffing

Polish-tier follow-ups from the same review pass; no behaviour-breaking changes.

- **`SHAREPOINT_ALLOWED_HOSTS` env var** now narrows the redirect allow-list to the operator's actual tenant (e.g. `tocsau.sharepoint.com,tocsau-my.sharepoint.com`). Falls back to the broad SharePoint Online / Microsoft namespace when unset (current behaviour). Suffix match, so `*.tocsau.sharepoint.com` is covered. (`api/orders/[id]/[action].js`)
- **`X-Doc-Source` header** explicitly tells the client whether `/certificate` and `/authority` responses are a SharePoint redirect (`sharepoint`) or a binary stream (`blob`). Frontend prefers this header over Content-Type sniffing; the legacy Content-Type fallback is kept for graceful upgrade. Fixes the edge case where `text/json` or a missing charset would have routed the response to the wrong handler.
- **`alreadyPresent` toast now lists what's there** — instead of *"All documents are already in SharePoint — nothing to do."* it reads *"SharePoint already has order summary, authority doc, payment receipt for this order — no re-upload needed."* using the URLs the server returns in the idempotent path.
- **All Save-to-SharePoint buttons disable while any save is in flight** — previously only the active row's button disabled; clicking a different row's button during an in-flight save was silently swallowed. Buttons now show as visibly disabled (50% opacity) on other rows with a tooltip explaining why.
- **`aria-label` + `aria-busy`** on all the new admin buttons (Download Certificate, Authority Doc, Invoice link, Save to SharePoint). Screen readers now announce them correctly and the spinner state is exposed via `aria-busy`.
- **Verified audit (no fix needed)**: `OCOrder/server.js:1086` and `api/orders/index.js:395` both construct `lotAuthorityFile` from the server-generated order ID plus a whitelisted/scrubbed extension. No user-controlled string flows into the filename.

---

## 2026-05-13 — Tier-3 follow-ups: token leak on /authority + /data, XFF spoofing, popup-blocker, bidi sanitisation

Seven issues from the second review pass over PR #37:

### Security
- **`?token=` query fallback removed from `GET /api/orders/:id/authority` and `GET /api/data`** — same Referer/log leak vector that PR #37 closed for `/certificate` was still open on these two endpoints. `/authority` is the worst case because it used to issue a 302 to SharePoint, carrying the admin token to `*.sharepoint.com` via `Referer`. The endpoint now mirrors `/certificate`: returns 200 `{url}` JSON for the SharePoint case (frontend opens it via a synthesised `<a target="_blank">` click) and streams the binary for the Redis KV fallback. Bearer header only.
- **`clientIp()` hardened against `x-forwarded-for` rotation** (`api/_lib/store.js`). The previous implementation returned `xff.split(",")[0]` — the *leftmost* entry, which on Vercel is the client-supplied value. A leaked admin token could rotate the header per request and bypass `save-to-sharepoint`'s 10/60s rate limit (and the `/track` rate limit). New selection order: `x-vercel-forwarded-for` → rightmost entry of `x-forwarded-for` → `req.socket?.remoteAddress`.
- **Unicode bidi / zero-width sanitisation in `sanitiseSegment`** — RTL override (U+202E) and ZW joiners are now stripped; segments are NFKC-normalised first. Not a traversal vector (Graph's path resolver was already safe per the security reviewer's analysis) but a phishing/UI-spoof primitive in admin audit-log surfaces and toasts.

### Correctness
- **Webhook SP IIFE bails when status flipped away from `Paid`** during the upload window — an admin cancelling the order between the lock release and the IIFE running no longer ends up with PDFs uploaded to a cancelled order. `readData` failure (Redis blip) now distinguishes "not found / not Paid" (skip) from "read failed" (fall back to the stale snapshot, better than dropping the upload).
- **`pushAuditOnce` helper** suppresses duplicate "SP upload failed" audit entries on webhook retries — a persistently misconfigured SharePoint deployment that previously produced ~288 duplicate rows per day now produces one rolling failure entry per 24 h. Only failure entries are deduped; successes still always append.

### UX
- **`window.open` replaced with a synthesised `<a target="_blank">.click()`** for the Download Certificate (and now Open Authority Doc) JSON-redirect path. Safari and Firefox routinely block `window.open` when the user-gesture context has been consumed by the preceding `await fetch`; the bytes branch worked because `<a>.click()` is gesture-exempt. Both endpoints now use the same helpers (`openUrlInNewTab`, `streamResponseAsDownload`).
- **`pubConfig` refreshed after SharePoint settings save** — enabling SP in Storage settings no longer requires a full page reload before the "↑ Save to SharePoint" button appears in the Orders tab.

---

## 2026-05-13 — PR #35/#36 tier-2 follow-ups: token leakage, open redirect, locking, rate limit, polish

Six issues from the same review pass as PR #36, plus three polish items:

### Security
- **`?token=` query-string fallback removed from `GET /api/orders/:id/certificate`** — the long-lived admin token would otherwise leak via Vercel access logs, browser history, and the `Referer` header when the response opens a SharePoint URL. The frontend already supplies the token via the `Authorization` header. Mirrored in `OCOrder/server.js`.
- **Host allow-list on the `/authority` 302 redirect** — `res.redirect(302, order.lotAuthorityUrl)` is now gated by `isAllowedRedirectHost()`, which checks the target is HTTPS and on `*.sharepoint.com`, `*.onmicrosoft.com`, or `*.microsoft.com`. A corrupted or forged `lotAuthorityUrl` value can no longer turn the portal into an open redirector / phishing chain.
- **`save-to-sharepoint` is now rate-limited** — `rateLimit('sp-save:'+ip, 10, 60)` blocks a leaked token from amplifying PDF generation + Graph API uploads into a function-quota / Graph-rate DoS. 429 with `Retry-After` header. Frontend surfaces a distinct "Too many SharePoint saves" toast.

### Correctness
- **`withOrderLock` around the post-upload audit writes** in both the Stripe webhook SP IIFE and `save-to-sharepoint`. A concurrent `amend` / `status` / `check-piq-payment` / `send-cert` no longer clobbers the URLs or audit entries the SP IIFE just produced.
- **Fresh-snapshot read inside the webhook SP IIFE before generating the order summary PDF** — the status-flip lock was released before the IIFE started; if an admin amended the order in between, the generated PDF would have been a stale snapshot. The IIFE now re-reads inside the IIFE so the PDF matches Redis.
- **`save-to-sharepoint` 503 on lock contention** — wraps the read-modify-write in `withOrderLock` and returns 503 ("Order is busy — please try again") on conflict instead of overwriting.

### UX / polish
- **Save-to-SharePoint button gated on `sharepointEnabled`** — exposed via the existing public-config endpoint (`/api/config/public`, boolean only). In local dev / demo / deployments without SP creds the button no longer renders, so clicks don't 400 with "SharePoint is not configured".
- **Download Certificate button hidden for legacy `Issued` orders without a stored copy** — previously the button showed and the click 404'd. Admin now sees no button until the certificate is (re-)sent with the PDF attached.
- **Webhook opportunistic SP upload on retries** — if `checkout.session.completed` arrives for an order that's already Paid but whose SP folder was never populated (an earlier run died mid-flight), the SP block now runs from the retry instead of just acknowledging. The email block is gated on `isFreshPayment` so customers don't receive duplicate confirmation emails.
- **Distinct 401 / 429 toasts in `saveOrderToSharePoint`** — matches the pattern in `downloadCertificate`.
- **Graph error notes truncated to 60 chars** in SP audit-log entries to avoid leaking internal SP folder paths via error response bodies.

---

## 2026-05-13 — PR #35 follow-ups: webhook lifetime, SP path traversal, download fix, idempotency

Four issues uncovered by a code-review pass over the merged PR #35:

1. **Stripe webhook dropped SP uploads after responding 200** — the previous fix moved SP work into a fire-and-forget IIFE and `await spPromise`'d after `res.status(200).json(...)`. Vercel Node serverless does not extend the function past `res.end()` (no `waitUntil` shim was used), so the SP block could be cancelled mid-flight. Combined with `tryClaimStripeEvent` already burning the Stripe event ID, this re-introduced the exact silent-failure mode PR #35 was meant to fix. `api/stripe-webhook/index.js` now awaits `spPromise` *before* sending the 200.
2. **SharePoint path traversal via user-controlled fields** — `orderSharePointSubFolder` only stripped `[\\/:*?"<>|]`. A customer submitting an order with `items[0].planName = ".."` produced a subfolder like `../OC-Certificates/…`, and `uploadOrderDocs` similarly concatenated the raw client-supplied `authDoc.filename` (e.g. `../../pwned.pdf`) into the upload path. Both paths funnel into Graph's `root:/{path}:/content`, which resolves `..` segments. Added a `sanitiseSegment` helper that strips control chars, leading/trailing dots and whitespace, and rejects dot-only segments to a safe fallback. Applied to `planName`, `order.id`, and authority filename.
3. **`downloadCertificate` silently failed on the common SharePoint-redirect path** — server returned `302 → certificateUrl`, the frontend `fetch(..., { redirect: "follow" })` followed cross-origin without CORS headers, response was opaque, and the admin got a generic "Could not download certificate" toast on the happy path. Server now returns `200 { url }` JSON for the SharePoint case and binary only for the KV/local fallback; frontend opens the URL in a new tab and only streams a blob when the response is binary. Distinct toast for 401/session-expired.
4. **`save-to-sharepoint` was not actually idempotent** — every click appended 1–3 audit-log rows even when URLs were already populated and unconditionally re-uploaded. The handler now gates each doc kind on the current order state (`needSummary = !order.summaryUrl`, etc.) and short-circuits with `{ ok: true, alreadyPresent: true }` when nothing is missing. A new "All documents are already in SharePoint — nothing to do." toast surfaces this in the UI.

---

## 2026-05-13 — Stripe webhook now uploads to SharePoint; admin Save-to-SharePoint button

### Bug
Several Stripe-paid orders (`TOCS-MOJI6FCL-YLC`, `TOCS-MOI215N8-GR4`, `TOCS-MOC7WG47-2ZZ`, ...) ended up with **no SharePoint folder at all** — not even the `order-summary.pdf` that's supposed to be created when payment is confirmed. Audit logs split into two distinct failure modes:

- **Mode A (`Payment confirmed via Stripe webhook`)** — `api/stripe-webhook/index.js` marked the order Paid and sent emails but never called `uploadToSharePoint`. When Stripe's server-to-server webhook beat the customer's browser to `stripe-confirm`, the SP upload block in `stripe-confirm` short-circuited on `status === "Paid"` and nothing was ever uploaded.
- **Mode B (`Order summary SP upload failed` / `Payment receipt SP upload failed`)** — `stripe-confirm` did run but the Graph API calls failed (timeout / token / network). The order moved on, the failures were audited, but there was no in-portal way to retry.

### Fix
- **`api/_lib/sharepoint.js`** — Added `isSharePointEnabled(spConfig)`, `orderSharePointSubFolder(order)`, and an `uploadOrderDocs(order, spConfig, pdf, opts)` helper that uploads `order-summary.pdf` + (optional) `authority-*` + (optional) `payment-receipt.pdf` to the canonical per-order subfolder and returns `{ authUrl, summaryUrl, receiptUrl, errors }`.
- **`api/stripe-webhook/index.js`** — Now calls `uploadOrderDocs` (with receipt) in parallel with emails; persists the URLs back onto the order; writes the same audit-log entries as `stripe-confirm`. The webhook responds to Stripe immediately, then awaits the SP IIFE in the Vercel post-response window.
- **`api/orders/[id]/[action].js`** — New `POST /api/orders/:id/save-to-sharepoint` admin endpoint regenerates the order summary (and receipt for paid Stripe orders), uploads alongside the authority doc, and writes URLs + audit entries. Idempotent — safe to retry.
- **Frontend (`src/App.jsx`)** — A `↑ Save to SharePoint` button now appears in the Documents section of any Paid/Issued/Processing order missing a `summaryUrl` (or, for Stripe orders, missing `receiptUrl`). One click repairs the SP folder.

### Recovering the affected orders
Open each broken order in Admin → Orders, expand it, and click **↑ Save to SharePoint** in the Documents section. The button creates `<Building>/OC-Certificates/<orderId>/` on SharePoint and uploads `order-summary.pdf`, the authority doc (if stored in Redis KV), and `payment-receipt.pdf` (Stripe orders only). After that, re-send the certificate with the PDF attached to populate the certificate copy too.

---

## 2026-05-13 — Send-Certificate: require attachment, persist a re-downloadable copy

### Bug
Two recent OC certificate orders (`TOCS-MOJI6FCL-YLC` and `TOCS-MOI215N8-GR4`) were marked **Issued** in the portal but the applicants received no attachment, and no SharePoint folder was created under the building. Root cause: `SendCertificateModal` labelled the file picker as **"(optional)"** and neither the frontend nor `send-certificate` rejected an empty submission. With zero attachments:
- the email was delivered with only the cover note (no PDF),
- the SharePoint upload block was gated by `if (attachments.length > 0)` and skipped, so no `…/<Building>/OC-Certificates/<orderId>/` folder was created,
- the order was still moved to **Issued**, masking the failure.

### Fix
- **Frontend (`src/App.jsx`)** — `SendCertificateModal` now requires at least one file before the Send button is enabled; the attachments label is marked required and copy updated from *"optional"* to *"required"*.
- **Vercel handler (`api/orders/[id]/[action].js`)** — `send-certificate` returns 400 when no attachment is supplied. After a successful send, the first attachment is also persisted to Redis KV (`tocs:certificate:<orderId>`, 365 d TTL) and the order is annotated with `certificateFile` + `certificateContentType` so the file can be re-served when the SharePoint link is missing.
- **Local server (`OCOrder/server.js`)** — Same attachment-required guard; sent certificate is copied into `uploads/<orderId>-certificate.<ext>` for re-download in dev.
- **`api/_lib/store.js`** — New `writeCertificate` / `readCertificate` helpers mirror the authority-doc pattern.

### Feature — Admin re-download
- **`GET /api/orders/:id/certificate`** (Vercel + local) — admin-only endpoint that redirects to the SharePoint view URL when present, otherwise streams the stored copy from Redis KV / `uploads/`.
- **Frontend** — every issued OC Certificate order now shows a **Download Certificate** button in the Documents section. Clicking it fetches the bytes (or follows the SP redirect) and triggers a browser download.

### Operational note
The two affected orders pre-date this change and have no stored copy on either store. The fix prevents recurrence and gives admins a one-click re-download for all future issued certificates; for the two existing orders the admin must re-send the certificate (with the PDF attached) to populate the new storage and the SharePoint folder.

---

## 2026-05-06 — Send-Certificate / Send-Invoice: multipart upload (fix for Vercel 4.5 MB body limit)

### Bug
Sending a ~3.9 MB OC certificate PDF through the admin portal failed with `Network error: Unexpected token 'R', "Request En"... is not valid JSON`. Root cause: the frontend base64-encoded the PDF into a JSON body, inflating it ~33% to ~5.3 MB — exceeding Vercel's 4.5 MB serverless request limit. Vercel returned a plain-text `Request Entity Too Large` page that the client tried to `JSON.parse`.

### Fix
- **Frontend (`src/App.jsx`)** — `SendCertificateModal` and `SendInvoiceModal` now upload the PDF as `multipart/form-data` (raw binary, no base64 inflation). Added `safeReadResponse()` helper that detects non-JSON error bodies (e.g. 413) and surfaces a meaningful error message instead of the JSON parse error.
- **Vercel handler (`api/orders/[id]/[action].js`)** — Added `parseMultipart()` + `readMessageAndAttachment()` helpers. Both routes now accept multipart (preferred) and legacy JSON+base64 (backward-compatible). Attachment is normalised to a Buffer.
- **Local server (`OCOrder/server.js`)** — `send-certificate` / `send-invoice` route now branches on Content-Type: multipart uses the existing `readMultipart()`, JSON uses `readBody()`.
- **`api/_lib/sharepoint.js`** — `uploadToSharePoint()` now accepts a Buffer or a base64 string for the file argument (avoids re-encoding round-trip on the multipart path).

A 3.9 MB PDF is now ~3.95 MB on the wire (multipart overhead is small) — well within the 4.5 MB cap.

---

## 2026-03-26 — Code Optimisation, Security & Demo/Shadow Environment

### Code Quality & Optimisation
- **`createSmtpTransporter` helper** — Extracted from 5 duplicated `nodemailer.createTransport` call sites into a single shared function.
- **`VALID_STATUSES` module constant** — Moved from local variable inside PUT handler to module level; used consistently across all status references.
- **`send-certificate` + `send-invoice` merged** — Single handler with `isCert` flag replaces two near-identical request handlers.
- **`filteredOrders` via `useMemo`** — Moved from inline recalculation on every render to memoized computation in Admin component.
- **SESSIONS expiry cleanup** — Added 30-min interval purge (with `.unref()`) to evict expired session tokens from memory.
- **TOCTOU fix: authority file deletion** — Replaced `existsSync` guard with `unlinkSync` + `ENOENT` catch.
- **Double `readData()` eliminated** — POST /api/orders now uses a single data read for both price validation and order write.
- **`useMemo` import added** to App.jsx.

### Security Fixes
- **Server-generated order IDs** — Client-supplied `id` field on POST /api/orders is now ignored; server generates `TOCS-{base36}-{hex4}` format.
- **Stripe payment gate** — Orders with `payment: "stripe"` rejected (400) if Stripe is not configured; bank/payid validated against `paymentMethods` flags.
- **Dead status strings removed from frontend** — `Mark Paid` button condition simplified from 4 dead status checks to just `"Pending Payment"`.
- **`orderCategory` dep fix** — Added `orderCategory` to `useEffect` dependency array fixing stale closure bug.

### Demo / Shadow Environment
- **Environment-variable driven multi-instance** — `DATA_FILE`, `CONFIG_FILE`, `UPLOADS_DIR`, `PORT`, `DEMO_MODE` env vars allow running production and demo instances from the same codebase.
- **`DEMO_SEED_DATA`** — 2 strata plans (SP10001 Harbour View, SP10002 Parkside Gardens) with 7 pre-seeded orders covering all order statuses.
- **`DEMO_DEFAULT_CONFIG`** — Demo admin credentials (`demo@tocs.co / Demo@1234`), demo payment details, no SMTP.
- **Auto-seed on first launch** — Demo mode writes seed data and config at startup if the files don't exist.
- **`/api/demo/reset` endpoint** — Resets both data and config to seed state, clears all sessions. Returns 403 in production mode.
- **`demoMode` in `/api/config/public`** — Frontend reads this flag to show/hide the demo banner.
- **Demo banner in App.jsx** — Yellow top bar displayed when `pubConfig.demoMode === true`, showing credentials and a "Reset Demo" button that calls the reset endpoint and reloads the page.
- **Startup banner** — Shows `Mode: DEMO 🔄 / Production`, `Data` file, and `Config` file paths.
- **`npm run demo` script** — `DATA_FILE=demo-data.json CONFIG_FILE=demo-config.json UPLOADS_DIR=uploads-demo PORT=3001 DEMO_MODE=true node server.js`.

---

## 2026-03-26 — Admin E2E Round 7: Config Parity, Plan Validation & Data Migration

### P2 Security / Crash Fixes

- **BUG-07-01: `paymentMethods` silently ignored on `POST /api/config/settings`** — Added `paymentMethods` handling; `bankEnabled`/`payidEnabled` booleans now persisted. `GET /api/config/settings` now returns `paymentMethods` object.
- **BUG-07-02: String `secondaryPrice` (e.g. `"99"`) stored in catalog → `toFixed()` crash in all email builders** — Plan validation now requires `secondaryPrice` to be a finite non-negative number. Order item price assignment now coerces both `price` and `secondaryPrice` through `Number()`.

### P3 Fixes

- **BUG-07-03: Products without an `id` field accepted silently into plan catalog** — Plan validation now requires every product to have a non-empty string `id`.
- **BUG-07-04: `logo` field returned by `GET /api/config/public` but unsettable** — `POST /api/config/settings` now accepts a `logo` string and persists it; `GET /api/config/settings` returns the current logo value.

### P4 Fixes

- **BUG-07-05: 84 legacy orders missing `status` field** — `readData()` now back-fills missing `status` as `"Pending Payment"` on every read (non-destructive migration).
- **BUG-07-06: `change-credentials` accepted new password identical to current** — Now returns 400 `"New password must differ from the current password."`.

---

## 2026-03-25 — Admin E2E Round 6: Admin Hardening, Shipping Total & Data Leaks

### P2 Security / Data Integrity Fixes

- **BUG-01: CRLF injected into admin `username` via add-admin** — Username now stripped of control chars (`\x00–\x1f`) before storage.
- **BUG-04: String product price (e.g. `"free"`) passed plan validation → NaN → $0 order** — Plan product validation now requires `typeof price === "number"` and `Number.isFinite(price)`.
- **BUG-05: `managerAdminCharge` exposed in unauthenticated `GET /api/data`** — Public response now strips `managerAdminCharge` from all plan products.
- **BUG-06: `selectedShipping.price` not included in `order.total`** — Total now sums item prices plus `selectedShipping.price`; shipping cost also re-validated server-side as non-negative.
- **BUG-07: `managerAdminCharge` returned to customer in order placement response** — `POST /api/orders` response now strips `managerAdminCharge` from item objects before returning to caller.
- **BUG-08: CRLF accepted in `paymentDetails` fields on config save** — `stripCRLF()` now applied to all `paymentDetails` string values.

### P3 Fixes

- **BUG-02: No max length on admin username** — `add-admin` now rejects usernames longer than 200 characters.
- **BUG-03: Negative `managerAdminCharge` accepted in plan products** — Plan product validation now rejects non-numeric or negative `managerAdminCharge`.
- **BUG-09: No upper cap on `item.qty`** — `qty` now capped at 100 per item.

---

## 2026-03-25 — Admin E2E Round 5: Field Whitelisting, Config Hardening & Parity

### P2 Security Fixes

- **BUG-01: `selectedShipping` stored verbatim including `__proto__` injection** — Now whitelisted to `{type, price}` only; `price` cast to non-negative number.
- **BUG-02: `items[]` used `...item` spread, persisting arbitrary client fields** — Replaced with explicit whitelist: `productId`, `lotId`, `lotNumber`, `planName`, `ocName`, `productName`, `ocId`, `qty` only; `price` and `managerAdminCharge` overridden from server catalog.
- **BUG-04: CRLF accepted in `emailTemplate` fields (header injection risk)** — `POST /api/config/settings` now strips `\r\n` from all email template string values via `stripCRLF()`.
- **BUG-05: CRLF accepted in `smtp.host` / `smtp.user`** — Both fields stripped of CRLF on save.
- **BUG-06: `adminNotificationIntro` rendered as raw HTML in admin notification email** — Now wrapped with `esc()` in `buildOrderEmailHtml`.

### P3 Fixes

- **BUG-03: New orders stored without `status` field** — Orders now created with `"Pending Payment"` (bank/payid/invoice) or `"Processing"` (stripe/card).
- **BUG-07: `smtp.pass` returned in plaintext in GET `/api/config/settings`** — Now masked as `"••••••••"` when set; POST handler ignores the placeholder on save.
- **BUG-08: Hardcoded default `adminNotificationSubject` still contained `{total}`** — Both occurrences updated to `"New Order — {orderType} #{orderId}"`.
- **BUG-09: Local server `/api/config/public` missing `bankEnabled`, `payidEnabled`, `stripeEnabled`, `logo`** — Local server now returns identical shape to Vercel `api/config/public.js`; `Cache-Control: no-store` header added.

### P4 Fixes

- **BUG-10: No length cap on `contactInfo.name` / `companyName`** — Now enforced at 200 chars each.
- **BUG-11: `qty` stored on items but not used in total (keys/fob orders)** — Non-perOC items now priced as `product.price × qty`; `qty` normalised to a positive integer in the item whitelist.
- **BUG-12: `smtp.host` accepted internal IPs / CRLF (SSRF vector)** — CRLF stripped from `smtp.host` on save (full hostname validation deferred).

---

## 2026-03-25 — Admin E2E Round 4: Order Integrity, Input Validation & XSS

### P2 Security Fixes

- **BUG-01: Order with missing/invalid `planId` bypassed all price enforcement** — `POST /api/orders` now requires `planId` to match a known plan; returns 400 `"A valid planId is required."` if absent or unrecognised.
- **BUG-02: Unknown `productId` bypassed item price enforcement** — Each item's `productId` is now validated against the plan catalog; returns 400 `"Unknown productId: ..."` rather than silently accepting the client-supplied price.

### P3 Functional / Security Fixes

- **BUG-03: Dead `/api/admin` route returned 405 for all requests** — Removed the stale entry from `knownRoutes`; the endpoint has no handler and all credential/admin actions are correctly at `POST /api/auth`.
- **BUG-04: `contactInfo.email` accepted malformed values including CRLF** — Same regex used for `cfg.orderEmail` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) now applied to the customer email at order placement.
- **BUG-05: CRLF and control characters accepted in `lotNumber`, `planName`, `ocName`, `productName`, `contactInfo` fields** — A `stripCtrl()` helper strips `\x00–\x1f` and `\x7f` from all string fields before they are stored or substituted into email subjects.
- **BUG-06: Lots without an `id` field silently dropped; import returned `{"ok":true,"count":0}`** — `POST /api/lots/import` now validates every lot object has a non-empty `id`; returns 400 `"Each lot must have a non-empty id field."`.
- **BUG-08: Admin `message` in certificate email rendered as raw HTML (XSS)** — `buildCertEmailHtml` now wraps `message` with `esc()` before inserting into the HTML body.

### P3 UX Fix

- **BUG-07: `POST /api/plans` with a flat array returned misleading `"Invalid plans."` error** — Error message updated to `'Body must be {"plans": [...]}'`.

---

## 2026-03-25 — Manager Admin Charge for Keys/Fob Products

### New Feature

- **Manager Admin Charge field on Keys/Fob products** — When setting up a Keys/Fobs/Remotes product for a building, admins can now enter a "Manager Admin Charge (AUD)" amount. This field is:
  - Only visible in the product add/edit modal when the category is "Keys / Fobs / Remotes"
  - Not shown to applicants at any point in the order flow
  - Stored in the strata plan's product record in `data.json`
  - Snapshotted onto each order item (`item.managerAdminCharge`) at order creation time, taken from the plan catalog server-side (tamper-proof)
  - Exported as a "Manager Admin Charge (AUD)" column in the admin CSV export — calculated as the sum of each item's charge multiplied by quantity; blank if zero

---

## 2026-03-25 — Admin E2E Round 3: Docs, Email & Payment Hardening (server.js)

### Medium Severity Bug Fixes

- **CRLF in `lotAuthorityFile` crashed the server (DoS)** — `lotAuthorityFile` is now sanitised with `replace(/[^\w.\-]/g, "_")` before use in the `Content-Disposition` header. The `fs.readFile` callback is wrapped in try/catch so header errors cannot escape to an uncaught handler and crash the process.
- **Authority file overwritten before duplicate order check** — The duplicate ID check is now performed before `fs.writeFileSync`, so a repeated submission with the same order ID can no longer overwrite the original authority document on disk.
- **`paymentDetails` fields unescaped in customer confirmation email (XSS)** — `pd.accountName`, `pd.bsb`, `pd.accountNumber`, and `pd.payid` are now all wrapped in `esc()` in `buildCustomerEmailHtml`. A malicious admin storing XSS payloads in payment config can no longer inject HTML into customer bank-transfer/PayID emails.

### Low Severity Bug Fixes

- **`order.lotAuthorityFile` unescaped in admin notification email** — Wrapped in `esc()` in `buildOrderEmailHtml`.
- **`order.id` unescaped in all three email templates** — Wrapped in `esc()` in every HTML context across all three email builders.
- **`orderEmail` display text unescaped in customer email footer** — Both the `href` and display text of the contact link now use `esc()`.

### Input Validation

- **`orderEmail` not validated as a proper email address** — `POST /api/config/settings` now checks `orderEmail` against a basic email pattern before saving; returns 400 if it fails.

### Reliability

- **Email failures not recorded in auditLog** — `sendOrderEmail` and `sendCustomerEmail` are now awaited via `Promise.allSettled()`. If either send fails, a `"Email send failed"` entry with the error message is appended to the order's `auditLog`, giving admins an in-app record of delivery failures.

---

## 2026-03-25 — Admin E2E Round 2: Security & Integrity Hardening (server.js)

### Critical Bug Fixes

- **Path traversal via `lotAuthorityFile`** — `POST /api/orders` now uses a field whitelist; `lotAuthorityFile` and all other admin-only fields are stripped before persistence. `GET /api/orders/:id/authority` now resolves the path with `path.basename()` and asserts the result is inside `UPLOADS_DIR`, preventing arbitrary file reads (including `config.json` and `/etc/passwd`).

### High Severity Bug Fixes

- **Per-item prices not validated against catalog (fraud vector)** — `POST /api/orders` now looks up each `item.productId` in the plan's products list and overwrites `item.price` with the server-authoritative price (applying `secondaryPrice` for additional OC items on `perOC` products). Clients can no longer set item prices to 1 cent.
- **Arbitrary order fields persisted from client** — Field whitelist on order creation: only `id`, `planId`, `lotId`, `orderCategory`, `contactInfo`, `payment`, `items`, `selectedShipping` are stored. Client-supplied `status`, `cancelReason`, `adminNotes`, `lotAuthorityFile` and any other field are stripped before persistence.

### Medium Severity Bug Fixes

- **Order IDs with slashes/spaces permanently unreachable** — `POST /api/orders` rejects IDs containing `/`, `\`, `?`, whitespace, `#`, or control characters. Max length 100 characters.
- **Executable file extensions accepted for authority upload** — Extension now validated against `[.pdf, .jpg, .jpeg, .png]`; anything else stored as `.bin`.
- **Duplicate lot IDs accepted in lots import** — `POST /api/lots/import` deduplicates by `id` (last occurrence wins) before writing.
- **Empty lots array silently wiped all lots** — `POST /api/lots/import` now returns 400 if `lots` array is empty.

### Low Severity Bug Fixes

- **Embedded newlines in CSV fields broke row structure** — CSV export now strips `\r`, `\n`, `\t` from all field values before quoting.

### Input Validation & Error Improvements

- **Oversized body returned connection-reset with no HTTP status** — `readBody()` now sends HTTP 413 with a JSON error body before `req.destroy()`.
- **Wrong HTTP methods returned 404** — Known API routes now return 405 Method Not Allowed with an `Allow:` header.
- **Empty `orderEmail` accepted** — `POST /api/config/settings` rejects empty/non-string `orderEmail` with 400.
- **Non-numeric SMTP port silently fell back to 587** — `smtp.port` now validated as a finite positive number; invalid values return 400.

---

## 2026-03-25 — Admin E2E Security & Validation Hardening (server.js)

### Critical Bug Fixes

- **Fraud-proof order total** — `POST /api/orders` now recalculates `total = Σ(item.price)` server-side; any client-supplied `total` is overridden. Prevents a $1 submission for $220 items.
- **Plan data corruption** — `POST /api/plans` now validates each plan is an object with a non-empty `id` (string) and `name` (string). Sending garbage like `[42, null, "string"]` now returns 400 instead of overwriting the entire plans database.

### High Severity Bug Fixes

- **send-certificate crash on null contactInfo** — Extracted `recipientEmail = order.contactInfo?.email` before SMTP setup; returns `400 "Order has no customer email address."` instead of throwing `TypeError` when an order has no contactInfo.
- **Status enum validation** — `PUT /api/orders/:id/status` now requires status to be one of `["Pending Payment","Processing","Issued","Cancelled","On Hold","Awaiting Documents","Invoice to be issued"]`; null, empty string, and arbitrary values all return 400.
- **XSS in HTML emails** — Added `esc()` HTML-escape helper (encodes `&`, `<`, `>`, `"`, `'`); applied to all user-supplied fields (`name`, `email`, `phone`, `companyName`, `productName`, `ocName`, `lotNumber`, `address`) in all three email builders.
- **Empty plans wipe** — `POST /api/plans` with `plans: []` now returns `400 "Plans array cannot be empty."` instead of silently deleting all strata plan data.
- **Duplicate plan IDs** — Plans submitted with duplicate `id` values are deduplicated (last occurrence wins) before writing.

### Medium Severity Bug Fixes

- **Authority doc 404 ambiguity** — `GET /api/orders/:id/authority` now returns `"Order not found."` when the order ID doesn't exist, distinct from `"No authority document for this order."` when the order exists but has no file attached.
- **Negative product prices** — `POST /api/plans` validates each product's `price >= 0`; returns 400 with the offending product name.

### Input Validation Improvements (Gaps)

- **Empty items array** — `POST /api/orders` with `items: []` now returns `400 "Order must contain at least one item."`.
- **Required contact info** — `POST /api/orders` requires `contactInfo.name` and `contactInfo.email` as non-empty strings; returns 400 if missing.
- **Order date normalisation** — `date` field is parsed and normalised to ISO 8601 on arrival; defaults to server time if missing or unparseable (previously stored invalid strings like `"not-a-date"`).

### Minor Fixes

- **CSV export auth header** — `GET /api/orders/export` now accepts `Authorization: Bearer <token>` in addition to `?token=` query param, avoiding session token exposure in server logs.

---

## 2026-03-21 — Bug Fixes, Keys Shipping, SP Uploads for Stripe

### Bug Fixes
- **Admin Orders blank page (crash)** — Two root causes fixed:
  1. `<>` shorthand fragment inside `.map()` had no `key` prop → changed to `<React.Fragment key={o.id}>`
  2. `o.items.length` and `o.items.map()` crashed for orders with missing `items` array → guarded with `(o.items || [])`

- **SMTP Test Email always fails after page reload** — `test-email.js` was forwarding the masked `••••••••` placeholder as the actual SMTP password. Fixed: if body sends masked value, API falls back to the real stored password from Redis config.

- **Keys/Fobs "Added" visual feedback broken** — Product cards never showed quantity controls (−/qty/+) after adding a Keys product. Root cause: `allAdded` used `inCart()` which checks key format `pid-null-lotId`, but keys products were stored with key `pid-null-lotId-keys`. Fixed: compute `cartItem` first, then use `!!cartItem` for `allAdded` on keys orders.

- **Contact step subtitle incorrect for Keys orders** — Step 4 always said "We'll send your order confirmation and certificate to these details." Fixed to dynamically show "invoice" for keys orders and "certificate" for OC orders.

### New Features

#### Keys/Fob Shipping Options (Step 4)
Four fixed shipping options now shown on Step 4 for keys/fob orders:
| Option | Cost | Address Required |
|--------|------|-----------------|
| Pick up from BM | $0 (fixed) | No |
| Standard Delivery | Configurable per plan | Yes |
| Express Delivery | Configurable per plan | No |
| No Shipment Required | $0 (fixed) | No |

- Address fields show/hide dynamically based on selection
- "Pick up from BM" auto-selected on entry to Step 4
- Admin configures Standard/Express costs via **Plans → Keys Shipping** modal
- Data stored as `plan.keysShipping: { deliveryCost, expressCost }` in Redis
- `selectedShipping` stored on order object as `{ id, name, cost, requiresAddress }`

#### Test SharePoint Button (Admin → Storage)
The existing 4-step SharePoint diagnostic API (`POST /api/config/test-sharepoint`) now has a UI button in the Storage admin tab. Results show step-by-step: `config → auth → site_read → drive_read` with ✅/❌ per step.

#### Email Failure Audit Logging
When admin/customer emails fail to send (SMTP error), the failure message is now written to `order.auditLog` with action `"Email notification failed"`. Previously failures were only logged to Vercel console logs — now visible directly in the Orders admin view.

#### SharePoint Uploads for Stripe Orders
After Stripe payment is confirmed via `stripe-confirm`, three files are now uploaded to SharePoint:
1. `authority-{filename}` — the authority document submitted with the order
2. `order-summary.pdf` — generated order summary
3. `payment-receipt.pdf` — new Stripe payment receipt PDF showing ref, date paid, amount, Stripe session ID

New PDF generator: `generateReceiptPdf(order, sessionId)` added to `api/_lib/pdf.js`.

### SMTP Credentials Updated
- SMTP username changed from `OCCAPP` → `ocorder`
- Password updated in Admin → Settings → SMTP

---

## 2026-03-20 — Stripe, Privacy Policy, Security & Bug Fixes

### New Features
- **Stripe Checkout** — Card payment via Stripe redirect flow; `stripeEnabled` flag hides option if key not set
- **Privacy Policy** — SPA route `/privacy-policy` with 10 TOCS-branded sections
- **Payment cancelled banner** — Dismissible yellow banner when Stripe redirects back with `?cancelled=1`
- **Order deletion** — Admin can permanently delete Cancelled orders

### Bug Fixes
- **PII protection** — `GET /api/data` returns `orders: []` without valid Bearer token
- **CSV Export** — Now accepts `Authorization: Bearer` header in addition to `?token=`
- **SMTP password** — Masked as `"••••••••"` in settings GET; POST ignores the mask
- **Ghost Stripe orders** — Key + zero-total validation fires BEFORE Redis write
- **CORS** — `DELETE` added to `Access-Control-Allow-Methods`
- **Status whitelist** — `PUT /api/orders/:id/status` rejects invalid statuses

---

## 2026-03-19 — Email & SharePoint Stability

- Removed `greetingTimeout` from nodemailer (was causing silent SMTP2GO failures)
- Emails moved synchronous before `res.json()` (guaranteed delivery within timeout)
- Graph SDK replaced with raw `fetch()` + `AbortController` (8s per upload)
- SP uploads fire-and-forget in parallel with emails from T=0
- Azure AD admin consent granted for `Sites.ReadWrite.All` / `Files.ReadWrite.All`

---

## 2026-03-15 — Design System Overhaul

- "Editorial Luxury" design: Cormorant Garamond + Inter, forest green `#1c3326`, greige `#ceceCD`
- 6-step portal flow, sticky header, step bar, plan cards, search input redesign
