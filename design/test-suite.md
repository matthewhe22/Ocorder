# Design — Test Suite

**Feature area:** Testing infrastructure
**Status:** Draft
**Last updated:** 2026-03-30

---

## Overview

This document defines the complete test suite for the TOCS OCC Order Portal. The project currently has zero test files, no `vitest.config.js`, no `playwright.config.js`, and no `e2e/` directory. This document specifies every artefact the implementation agent must create to satisfy the mandatory testing standards (unit + integration + E2E; 100% line coverage on changed code).

All test files are colocated with their source as `*.test.js` / `*.test.jsx` for unit and integration tests. E2E tests live in `e2e/`.

---

## 1. vitest.config.js Spec

```js
// vitest.config.js (repo root)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ESM project — run tests in Node environment by default
    environment: "node",

    // Include colocated test files in api/ and src/
    include: [
      "api/**/*.test.js",
      "src/**/*.test.jsx",
      "src/**/*.test.js",
    ],

    // Setup file runs before every test file
    setupFiles: ["./test/setup.js"],

    // v8 native coverage provider (fastest; no instrumentation)
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",

      // Files measured for coverage — only changed/tested code
      include: [
        "api/_lib/**/*.js",
        "api/auth/**/*.js",
        "api/config/**/*.js",
        "api/orders/**/*.js",
        "api/lots/**/*.js",
        "api/data.js",
        "api/plans.js",
      ],

      // Hard thresholds — npm run test:coverage fails if any fall below 100%
      thresholds: {
        lines:      100,
        functions:  100,
        branches:   100,
        statements: 100,
      },
    },

    // Allow top-level await in test files (required by ESM handlers)
    globals: false,
  },
});
```

**Notes for the implementation agent:**

- The project uses `"type": "module"` in `package.json`, so all imports use ESM. Vitest handles this natively.
- `pdfkit` and `nodemailer` will need mocking to avoid network calls and file I/O in unit tests.
- Add `vitest` and `@vitest/coverage-v8` to `devDependencies`.
- Add the following npm scripts to `package.json`:
  - `"test": "vitest run"`
  - `"test:coverage": "vitest run --coverage"`
  - `"test:watch": "vitest"`

---

## 2. playwright.config.js Spec

```js
// playwright.config.js (repo root)
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.js",

  // Fail fast on CI; allow retries locally
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Shared settings for all tests
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // Browser targets
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],

  // Start the local dev server before running tests
  webServer: {
    command: "node server.js",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

**Notes for the implementation agent:**

- Add `@playwright/test` to `devDependencies`.
- Add `"test:e2e": "playwright test"` to npm scripts.
- The E2E tests target `server.js` (self-hosted Node path) because `vercel dev` has a slow cold start. All API handlers are equivalent between the two paths for the tested flows.
- E2E tests that exercise the admin panel must use a test Redis instance (set `REDIS_URL` to a local Redis or Upstash test DB before running).
- The `e2e/` directory must contain a `fixtures/` subdirectory with a small valid PDF file (`authority-doc.pdf`) and a small PNG file (`authority-doc.png`) used by file upload tests.

---

## 3. Test Utilities Needed

All utilities live in `test/` at the repo root (not colocated — they are shared by all test files).

### 3.1 `test/setup.js` — Global setup

Loaded by `vitest.config.js` `setupFiles`. Responsible for:

- Setting `process.env.REDIS_URL` to the test Redis URL (from `TEST_REDIS_URL` env var or a local Redis instance).
- Setting `process.env.ADMIN_USER`, `process.env.ADMIN_PASS`, `process.env.TOKEN_SECRET` to safe test values.
- Clearing `_client` singleton between tests by resetting the module (see note on `vi.resetModules()` below).

```js
// test/setup.js
process.env.REDIS_URL      = process.env.TEST_REDIS_URL || "redis://localhost:6379";
process.env.ADMIN_USER     = "testadmin@example.com";
process.env.ADMIN_PASS     = "TestPass123!";
process.env.TOKEN_SECRET   = "test-token-secret-32-chars-minimum";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";  // overridden per-test as needed
```

### 3.2 `test/redis-helpers.js` — Redis test client

Provides `flushTestDb()` (calls `FLUSHDB` on the test Redis) and `seedTestData(data)` / `seedTestConfig(config)` helpers. These helpers bypass the app's store module to write directly via the `redis` npm package.

```js
// test/redis-helpers.js
import { createClient } from "redis";

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

export async function flushTestDb() {
  await client.flushDb();
}

export async function seedData(data) {
  await client.set("tocs:data", JSON.stringify(data));
}

export async function seedConfig(cfg) {
  await client.set("tocs:config", JSON.stringify(cfg));
}

export async function getStored(key) {
  const raw = await client.get(key);
  return raw ? JSON.parse(raw) : null;
}
```

Integration tests call `flushTestDb()` in `beforeEach` to ensure isolation.

### 3.3 `test/request-factory.js` — Mock req/res for Vercel handlers

All Vercel serverless handlers are plain `async function handler(req, res)`. This factory creates mock objects that implement the minimal subset used by the app.

```js
// test/request-factory.js
export function makeReq({ method = "GET", body = {}, headers = {}, query = {} } = {}) {
  return { method, body, headers, query };
}

export function makeRes() {
  const res = {
    _status: null,
    _body: null,
    _headers: {},
    _redirectUrl: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
    send(body) { this._body = body; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    redirect(code, url) { this._status = code; this._redirectUrl = url; return this; },
    get headersSent() { return this._status !== null; },
  };
  return res;
}
```

### 3.4 `test/nodemailer-mock.js` — nodemailer mock

Used to intercept `sendMail` calls without hitting a real SMTP server.

```js
// test/nodemailer-mock.js
import { vi } from "vitest";

// Captures all sent mail objects for assertion in tests
export const sentMail = [];

export function resetSentMail() {
  sentMail.length = 0;
}

export function mockNodemailer() {
  vi.mock("nodemailer", () => ({
    default: {
      createTransport: () => ({
        sendMail: vi.fn(async (opts) => {
          sentMail.push(opts);
          return { messageId: "test-id" };
        }),
        verify: vi.fn(async () => true),
      }),
    },
  }));
}
```

### 3.5 `test/stripe-mock.js` — Stripe mock

Used to stub the Stripe SDK without making real API calls.

```js
// test/stripe-mock.js
import { vi } from "vitest";

export function mockStripe({ sessionUrl = "https://checkout.stripe.com/test", paymentStatus = "paid", metadata = {} } = {}) {
  vi.mock("stripe", () => {
    return {
      default: vi.fn().mockImplementation(() => ({
        checkout: {
          sessions: {
            create: vi.fn(async (params) => ({
              id: "cs_test_123",
              url: sessionUrl,
              metadata: params.metadata || {},
            })),
            retrieve: vi.fn(async (id) => ({
              id,
              payment_status: paymentStatus,
              metadata,
            })),
          },
        },
      })),
    };
  });
}
```

### 3.6 `test/sharepoint-mock.js` — SharePoint upload mock

```js
// test/sharepoint-mock.js
import { vi } from "vitest";

export function mockSharePointEnabled(returnUrl = "https://sp.example.com/file") {
  vi.mock("../api/_lib/sharepoint.js", () => ({
    uploadToSharePoint: vi.fn(async () => returnUrl),
    SHAREPOINT_ENABLED: true,
    FOLDER_PATH: "Test/Folder",
  }));
}

export function mockSharePointDisabled() {
  vi.mock("../api/_lib/sharepoint.js", () => ({
    uploadToSharePoint: vi.fn(async () => null),
    SHAREPOINT_ENABLED: false,
    FOLDER_PATH: "Test/Folder",
  }));
}
```

---

## 4. Unit Test Plan

Unit tests exercise pure and near-pure functions. They mock all I/O (Redis, SMTP, Stripe, SharePoint). Each file below gets its own `*.test.js` colocated alongside the source.

---

### 4.1 `api/_lib/store.test.js`

**Mocks required:** Redis client (`getClient`), `process.env`

#### `cors(res)`
- Sets `Access-Control-Allow-Origin: *` header on the response object.
- Sets `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`.

#### `extractToken(req)`
- Returns the token string when `Authorization: Bearer <token>` header is present.
- Returns `null` when the header is missing.
- Returns `null` when the header is `"Bearer "` (empty token part).
- Returns `null` when the header does not start with `"Bearer "`.

#### `validToken(token)`
- Returns `false` for `null` input.
- Returns `false` for a token without a dot.
- Returns `false` for a token with a valid payload but a wrong HMAC signature.
- Returns `false` for a token whose payload decodes to an expired `exp` (past timestamp).
- Returns `true` for a freshly created token (via `createSession`) before its 8-hour expiry.
- Returns `false` after the token's expiry time has elapsed (use `vi.setSystemTime`).
- Returns `false` when signature buffer lengths differ (length mismatch guard).
- Returns `false` for a malformed base64url payload that `JSON.parse` cannot parse.

#### `createSession(user)`
- Returns a string in the format `<base64url>.<hexsig>`.
- The decoded payload contains `{ user, exp }` where `exp` is approximately 8 hours from now.
- The returned token passes `validToken()` immediately.
- Two calls at different times produce different tokens (different `exp`).

#### `readData()` (unit — Redis mocked)
- Returns `DEFAULT_DATA` when `kvGet` returns `null` (Redis miss).
- Returns data unchanged when no migration triggers apply (plan has all fields, products are present).
- Appends missing products from `DEFAULT_DATA` when a matching plan ID exists but is missing product IDs (migration: missing products).
- Adds `shippingOptions: []` when a matching plan lacks the field (migration: missing shippingOptions).
- Adds `keysShipping: { deliveryCost: 0, expressCost: 0 }` when any plan lacks `keysShipping` (migration: missing keysShipping, including custom plans not in DEFAULT_DATA).
- Calls `kvSet` to write back when any migration runs.
- Does NOT call `kvSet` when no migration is needed.

#### `writeData(d)`
- Calls `kvSet(DATA_KEY, d)` with the provided data.
- Throws when KV is unavailable (`KV_AVAILABLE` is false).

#### `readConfig()`
- Returns `DEFAULT_CONFIG` when `kvGet` returns `null`.
- Deep-merges stored config with `DEFAULT_CONFIG` so missing sub-fields are filled from defaults.
- `smtp.pass` env var override: when stored smtp.pass is empty AND `process.env.SMTP_PASS` is set, the env var value is used.
- `smtp.host` env var override: same pattern.
- `smtp.user` env var override: same pattern.
- Stored non-empty values take precedence over `DEFAULT_CONFIG` values.

#### `writeConfig(c)`
- Calls `kvSet(CONFIG_KEY, c)`.

#### `writeAuthority(orderId, doc)` / `readAuthority(orderId)`
- `writeAuthority("ORD-1", doc)` calls `kvSet("tocs:authority:ORD-1", doc)`.
- `readAuthority("ORD-1")` calls `kvGet("tocs:authority:ORD-1")`.

#### `invalidateSession(_token)` / `invalidateAllSessions()`
- Both are no-ops; verify they can be called without throwing.

---

### 4.2 `api/_lib/email.test.js`

**Mocks required:** None (pure HTML builders and transporter factory)

#### `buildOrderEmailHtml(order)`
- Returns a string containing the order ID.
- Includes the customer name from `order.contactInfo.name`.
- Includes the formatted total as `$X.XX AUD`.
- Shows `"Agent / Representative"` for `applicantType === "agent"`.
- Shows `"Owner"` for `applicantType !== "agent"`.
- Shows the company name row when `applicantType === "agent"` and `companyName` is set.
- Shows the owner name row when `applicantType !== "agent"` and `ownerName` is set.
- Renders a delivery address section when `contactInfo.shippingAddress.street` is present.
- Does NOT render the delivery address section when `shippingAddress` is absent.
- Renders a shipping cost row in the items table when `order.selectedShipping.cost > 0`.
- Shows `"Stripe (Card)"` as payment label when `order.payment === "stripe"`.
- Shows `"Direct Bank Transfer"` when `order.payment === "bank"`.
- Shows `"PayID"` when `order.payment === "payid"`.
- Shows `order.lotAuthorityFile` filename in the footer note when present.
- Shows `"Not provided"` in the footer note when `lotAuthorityFile` is absent.
- Does not throw when `order.items` is an empty array.
- Does not throw when `order.date` is not a valid date string (catches parse error and shows `"—"`).

#### `buildCustomerEmailHtml(order, cfg)`
- Returns a string containing the order ID.
- Shows `"awaiting payment"` message when `order.payment === "bank"`.
- Shows `"awaiting payment"` message when `order.payment === "payid"`.
- Shows payment-received message for non-pending payment types (e.g. `"stripe"`).
- Includes bank transfer details block when `order.payment === "bank"` (account name, BSB, account number, reference).
- Includes PayID details block when `order.payment === "payid"`.
- Does NOT include bank/PayID details block for `"stripe"` payment.
- Shows GST amount as `(total / 11).toFixed(2)`.
- Renders delivery address block when `contactInfo.shippingAddress.street` is present.
- Shows the footer from `cfg.emailTemplate.footer`.
- Shows the order email from `cfg.orderEmail` in the contact line.

#### `createTransporter(smtp)`
- Returns a nodemailer transporter (object with `sendMail`).
- Uses `port === 465` → `secure: true`.
- Uses `port !== 465` → `secure: false`.
- Sets `connectionTimeout: 8000` and `socketTimeout: 10000`.
- Does NOT set `greetingTimeout` (verify the key is absent from the transporter options).

---

### 4.3 `api/_lib/pdf.test.js`

**Mocks required:** None

#### `generateOrderPdf(order)`
- Returns a `Promise<Buffer>`.
- The resolved Buffer has a non-zero length (is a real PDF — starts with `%PDF`).
- Does not throw for an order with an empty `items` array.
- Does not throw for an order with a `shippingAddress`.
- Does not throw for a keys order (`orderCategory === "keys"`).
- Does not throw for a bank transfer order (`payment === "bank"`).
- Does not throw when `order.contactInfo` is absent (uses defaults).
- Does not throw for an order with multiple items including one with `qty > 1`.

#### `generateReceiptPdf(order, sessionId)`
- Returns a `Promise<Buffer>`.
- The resolved Buffer has a non-zero length (starts with `%PDF`).
- Does not throw when `sessionId` is null or undefined.
- Uses the `paidEntry.ts` from `order.auditLog` when a "Payment confirmed via Stripe" entry exists.
- Uses `new Date()` when no Stripe audit log entry is found.
- Does not throw when `order.auditLog` is empty or absent.

---

### 4.4 `api/_lib/sharepoint.test.js`

**Mocks required:** `@azure/identity` (ClientSecretCredential), global `fetch`

#### `uploadToSharePoint(filename, contentType, base64Data, spConfig, subFolder)`
- Returns `null` immediately when all required config fields are absent.
- Returns `null` when `tenantId` is absent (even if others are present).
- Uses `spConfig` values when provided, falling back to env vars when `spConfig` fields are empty.
- Calls `credential.getToken("https://graph.microsoft.com/.default")` for OAuth.
- Constructs the PUT URL with `${folderPath}/${subFolder}/${filename}` (all segments URI-encoded).
- Constructs the PUT URL without the subFolder segment when `subFolder` is `null`.
- Returns `null` when the PUT response is not `ok` (non-2xx status).
- Returns `null` when the PUT fetch call times out (AbortController fires after 8000ms).
- Returns the `link.webUrl` from the createLink response on success.
- Returns `null` (not throws) when the createLink response is not `ok`.
- Returns `null` (not throws) on any unexpected error.

---

### 4.5 `api/auth/login.test.js`

**Mocks required:** `../api/_lib/store.js` (readConfig, createSession)

#### `handler(req, res)` — POST /api/auth/login
- Returns 200 with `{ token, user }` when `user` and `pass` match stored config.
- Returns 400 when `user` is missing from request body.
- Returns 400 when `pass` is missing from request body.
- Returns 400 when both `user` and `pass` are missing.
- Returns 401 when `user` is correct but `pass` is wrong.
- Returns 401 when `user` is wrong.
- Returns 405 for non-POST methods.
- Returns 200 for OPTIONS preflight.
- Returns 500 when `readConfig()` throws.
- Sets CORS headers on all responses.

---

### 4.6 `api/auth/change-credentials.test.js`

**Mocks required:** `../api/_lib/store.js` (readConfig, writeConfig, validToken, extractToken, invalidateAllSessions)

#### `handler(req, res)` — POST /api/auth/change-credentials
- Returns 401 when no Bearer token is present.
- Returns 401 when the Bearer token is invalid.
- Returns 400 when `currentPass` does not match stored `cfg.pass`.
- Returns 400 when `newPass` is shorter than 8 characters.
- Returns 200 when `currentPass` is correct and `newPass` meets length requirement; verifies `cfg.pass` is updated and `writeConfig` is called.
- Returns 200 when only `newUser` is provided (no `newPass`); verifies `cfg.user` is updated with trimmed value.
- Does not update `cfg.user` when `newUser` is an empty string or whitespace-only.
- Calls `invalidateAllSessions()` on success.
- Returns 405 for non-POST methods.
- Returns 200 for OPTIONS preflight.

---

### 4.7 `api/config/public.test.js`

**Mocks required:** `../api/_lib/store.js` (readConfig)

#### `handler(req, res)` — GET /api/config/public
- Returns 200 with `{ logo, stripeEnabled, paymentDetails }`.
- `stripeEnabled` is `true` when `process.env.STRIPE_SECRET_KEY` is set.
- `stripeEnabled` is `false` when `process.env.STRIPE_SECRET_KEY` is unset.
- Returns 405 for non-GET methods.
- Returns 200 for OPTIONS preflight.
- `paymentDetails` contains values from `cfg.paymentDetails`, falling back to defaults when absent.

---

### 4.8 `api/config/settings.test.js`

**Mocks required:** `../api/_lib/store.js` (readConfig, writeConfig, validToken, extractToken)

#### GET `/api/config/settings`
- Returns 401 when no valid token.
- Returns 200 with all settings fields.
- `smtp.pass` is returned as `"••••••••"` when a password is stored.
- `smtp.pass` is returned as `""` when no password is stored.
- `sharepoint.clientSecret` is returned as `"••••••••"` when a secret is stored.
- `sharepoint.clientSecret` is returned as `""` when not stored.

#### POST `/api/config/settings`
- Returns 401 when no valid token.
- Updates `orderEmail` when provided; calls `writeConfig` with updated cfg.
- Updates `logo` when provided.
- Updates `smtp.host`, `smtp.port`, `smtp.user` when provided.
- Does NOT update `smtp.pass` when the value is `"••••••••"` (masked placeholder).
- Updates `smtp.pass` when a real non-masked value is provided.
- Does NOT update `sharepoint.clientSecret` when the value is `"••••••••"`.
- Updates `sharepoint.clientSecret` when a real value is provided.
- Performs partial update: fields not in the request body are unchanged.
- Returns 500 when `writeConfig` throws.

---

### 4.9 `api/config/test-email.test.js`

**Mocks required:** `nodemailer`, `../api/_lib/store.js` (readConfig, validToken, extractToken)

#### `handler(req, res)` — POST /api/config/test-email
- Returns 401 when no valid token.
- Returns 400 when SMTP host is missing from both request body and stored config.
- Returns 400 when SMTP user is missing.
- Returns 400 when SMTP pass is missing.
- Uses request body SMTP values when provided.
- Falls back to stored config SMTP values when request body omits them.
- Uses stored `cfg.smtp.pass` when request body sends the masked `"••••••••"` placeholder.
- Calls `transporter.verify()` before `sendMail`.
- Sends email to `toEmail` address from request body or stored config.
- Returns 200 `{ ok: true, sentTo }` on success.
- Returns 500 with the nodemailer error message on SMTP failure.

---

### 4.10 `api/config/test-sharepoint.test.js`

**Mocks required:** `@azure/identity`, global `fetch`, `../api/_lib/store.js` (readConfig)

**Note — gap between code and PRD:** `test-sharepoint.js` checks only that an `Authorization` header is non-empty (`auth = req.headers.authorization?.split(" ")[1]`). It does NOT call `validToken()`. This is the SEC-4 vulnerability. The test must assert the current buggy behaviour and must also have a test for the expected behaviour once SEC-4 is fixed. Flag this gap in the test file as a TODO.

#### `handler(req, res)` — POST /api/config/test-sharepoint
- Returns 401 when `Authorization` header is absent (current behaviour: 401 from the `if (!auth)` check).
- Returns 200 `{ ok: false, step: "config", error: ... }` when SharePoint config fields are missing.
- Returns 200 `{ ok: false, step: "auth", error: ... }` when OAuth token acquisition fails.
- Returns 200 `{ ok: false, step: "site_read", httpStatus, error }` when site read returns non-2xx.
- Returns 200 `{ ok: false, step: "drive_read", httpStatus, error }` when drive read returns non-2xx.
- Returns 200 `{ ok: true, siteName, siteWebUrl, folderPath, message }` on full success.
- Returns 405 for non-POST methods.

---

### 4.11 `api/data.test.js`

**Mocks required:** `./api/_lib/store.js` (readData, validToken, extractToken)

#### `handler(req, res)` — GET /api/data
- Returns 200 with `{ strataPlans, orders: [] }` when no token (unauthenticated).
- Returns 200 with `{ strataPlans, orders: [<all orders>] }` when a valid Bearer token is present.
- Accepts token via `?token=` query param as well as Authorization header.
- Returns 405 for non-GET methods.
- Returns 200 for OPTIONS preflight.

---

### 4.12 `api/plans.test.js`

**Mocks required:** `./api/_lib/store.js` (readData, writeData, validToken, extractToken)

#### `handler(req, res)` — POST /api/plans
- Returns 401 when no valid token.
- Returns 400 when `plans` is not an array.
- Returns 400 when `plans` is absent from request body.
- Returns 200 `{ ok: true }` when `plans` is a valid array; verifies `writeData` was called with updated plans.
- Replaces the entire `strataPlans` array (not a merge).
- Returns 405 for non-POST methods.
- Returns 200 for OPTIONS preflight.

---

### 4.13 `api/lots/import.test.js`

**Mocks required:** `../../api/_lib/store.js` (readData, writeData, validToken, extractToken)

#### `handler(req, res)` — POST /api/lots/import
- Returns 401 when no valid token.
- Returns 400 when `planId` is missing.
- Returns 400 when `lots` is not an array.
- Returns 404 when `planId` does not match any stored plan.
- Returns 200 `{ ok: true, count: N }` on success; verifies the plan's `lots` array is replaced.
- Returns 405 for non-POST methods.
- Returns 200 for OPTIONS preflight.

---

### 4.14 `api/orders/export.test.js`

**Mocks required:** `../../api/_lib/store.js` (readData, validToken)

#### `handler(req, res)` — GET /api/orders/export
- Returns 401 when no valid token (via header or query param).
- Accepts token via `?token=` query param.
- Returns a CSV response with correct `Content-Type: text/csv` header.
- Returns a `Content-Disposition` header with `attachment; filename="tocs-orders-<date>.csv"`.
- CSV contains a header row with the correct column names.
- CSV rows contain correct values for each order field (ID, name, email, phone, status, etc.).
- Handles `applicantType` inference from `companyName` when `applicantType` is absent (backward compat).
- Delivery address is concatenated with commas when present.
- Delivery address is empty string when absent.
- CSV values containing double quotes are escaped with doubled quotes (RFC 4180).
- Returns 405 for non-GET methods.

---

### 4.15 `api/orders/index.test.js`

**Mocks required:** `../../api/_lib/store.js` (readData, writeData, readConfig, writeAuthority, KV_AVAILABLE), `../../api/_lib/sharepoint.js`, `../../api/_lib/pdf.js`, nodemailer, Stripe

#### `handler(req, res)` — POST /api/orders
- Returns 405 for non-POST methods.
- Returns 400 when `order.id` is missing.
- Returns 400 when `order.items` is not an array.
- Returns 400 when `order.payment === "stripe"` and `STRIPE_SECRET_KEY` is unset.
- Returns 400 when `order.payment === "stripe"` and `order.total <= 0`.
- Returns 200 `{ ok: true, order, emailSentTo }` for a valid non-Stripe order.
- Saves order to Redis (`writeData` called with the order prepended to `orders`).
- Sets `order.auditLog[0]` with `action: "Order created"` and the customer name.
- Sets `order.lotAuthorityFile` from `body.lotAuthority.filename` when present.
- Saves authority doc to Redis via `writeAuthority` when `body.lotAuthority.data` is present and `KV_AVAILABLE` is true.
- Does NOT call `writeAuthority` when `body.lotAuthority.data` is absent.
- Sends admin notification email when SMTP is configured (`smtp.host`, `smtp.user`, `smtp.pass` all set).
- Sends customer confirmation email when SMTP is configured and `order.contactInfo.email` is present.
- Does NOT send email when SMTP is not fully configured (missing host, user, or pass).
- Attaches authority doc to admin email when `body.lotAuthority.data` is present.
- For Stripe payment: calls `stripe.checkout.sessions.create` with correct `line_items`, `success_url`, `cancel_url`, and `metadata`.
- For Stripe payment: saves `stripeSessionId` on the order and calls `writeData` again.
- For Stripe payment: saves authority doc to Redis.
- For Stripe payment: returns `{ id, redirect }` pointing to the Stripe checkout URL.
- For Stripe payment: returns 500 when `stripe.checkout.sessions.create` throws.
- When SharePoint is enabled: calls `uploadToSharePoint` for authority doc and order summary PDF.
- SP upload failures do not cause the handler to return an error (non-fatal).
- Returns 500 when `writeData` throws.

---

### 4.16 `api/orders/[id]/[action].test.js`

**Mocks required:** All of: store.js, sharepoint.js, email.js, pdf.js, nodemailer, Stripe

#### `authority` action — GET
- Returns 401 when no valid token.
- Returns 404 when order not found.
- Returns 404 when order has no `lotAuthorityFile` and no `lotAuthorityUrl`.
- Returns 302 redirect to `lotAuthorityUrl` when the URL is present.
- Returns 503 when `lotAuthorityUrl` is absent and KV is not available.
- Returns the file bytes from Redis when `lotAuthorityUrl` is absent and KV is available.
- Sets correct `Content-Type` and `Content-Disposition` headers when serving from Redis.
- Returns 503 when `readAuthority` throws.
- Returns 404 when Redis returns null/empty stored authority doc.

#### `status` action — PUT
- Returns 401 when no valid token.
- Returns 400 when `status` is missing.
- Returns 400 when `status` is not a valid enum value (exact set from the `VALID_STATUSES` array).
- Returns 404 when order not found.
- Returns 200 `{ ok: true }` on success; verifies order status is updated in Redis.
- Appends an audit log entry with correct action string.
- Sets `cancelReason` when `status === "Cancelled"` and `note` is provided.
- Does NOT set `cancelReason` when `status === "Cancelled"` but `note` is absent.
- Does NOT set `cancelReason` for non-Cancelled statuses even if `note` is provided.

#### `send-certificate` action — POST
- Returns 401 when no valid token.
- Returns 404 when order not found.
- Returns 400 when SMTP is not configured (host, user, or pass missing).
- Sends email to `order.contactInfo.email` with the certificate subject.
- Replaces `{orderId}` in the subject template.
- Attaches the provided attachment as a Buffer.
- Does NOT attach when `attachment.data` is absent.
- Sets order status to `"Issued"` in Redis.
- Appends `"Certificate issued"` audit log entry with `"Sent to: <email>"` note.
- When attachment is present and SharePoint is enabled: calls `uploadToSharePoint` and saves `certificateUrl`.
- SharePoint failure does not prevent the 200 response.
- Returns 500 when `sendMail` throws.

#### `send-invoice` action — POST
- Returns 401 when no valid token.
- Returns 404 when order not found.
- Returns 400 when SMTP is not configured.
- Sends email to `order.contactInfo.email` with the invoice subject.
- Uses `message` from request body as email body when provided.
- Uses a default message containing payment details when `message` is absent.
- Sets order status to `"Invoice sent, awaiting payment"` in Redis.
- Appends `"Invoice sent"` audit log entry with `"Sent to: <email>"` note.
- When attachment present and SharePoint enabled: calls `uploadToSharePoint`, saves `invoiceUrl`.
- Returns 500 when `sendMail` throws.

#### `stripe-confirm` action — POST
- Returns 503 when `STRIPE_SECRET_KEY` is not set.
- Returns 404 when order not found.
- Returns 200 `{ success: true, order }` immediately (idempotency) when `order.status === "Paid"`.
- Returns 400 when order has no `stripeSessionId`.
- Returns 500 when `stripe.checkout.sessions.retrieve` throws.
- Returns 400 when `session.metadata.orderId !== id` (cross-order protection).
- Returns 402 `{ error, payment_status }` when `session.payment_status !== "paid"`.
- Returns 200 `{ success: true, order }` when payment is confirmed.
- Sets order status to `"Paid"` in Redis on success.
- Appends `"Payment confirmed via Stripe"` audit log entry with session ID in note.
- Sends admin and customer emails on success (when SMTP configured).
- Does NOT send emails when SMTP is not configured.
- SharePoint upload calls are made when SharePoint is enabled (authority doc, order summary, payment receipt).

#### `delete` action — DELETE
- Returns 401 when no valid token.
- Returns 404 when order not found.
- Returns 200 `{ ok: true, deleted: id }` on success; verifies order is removed from Redis.

#### Unknown action
- Returns 404 `{ error: "Unknown action." }` for any unrecognised action value.

---

## 5. Integration Test Plan

Integration tests require a **real Redis instance** (local Redis via Docker or an Upstash test database). They call the actual `store.js` functions without mocking Redis. Nodemailer, Stripe, and SharePoint are still mocked.

Each integration test file imports from `test/redis-helpers.js` and calls `flushTestDb()` in `beforeEach`.

### 5.1 `api/_lib/store.integration.test.js`

#### readData / writeData round-trips
- Write data with `writeData({ strataPlans: [...], orders: [] })` and read it back with `readData()`; assert the objects are deeply equal.
- `readData()` returns `DEFAULT_DATA` when `tocs:data` is not in Redis.
- Writing and reading orders preserves all order fields including nested objects (contactInfo, auditLog, items).

#### Migration logic
- Seed Redis with a plan that has `shippingOptions` missing: `readData()` adds `shippingOptions: []` and writes back.
- Seed Redis with a plan that has `keysShipping` missing: `readData()` adds `keysShipping: { deliveryCost: 0, expressCost: 0 }` and writes back.
- Seed Redis with a plan that has missing products relative to `DEFAULT_DATA`: `readData()` appends the missing products.
- Verify that after a migrating `readData()`, a subsequent `readData()` call does NOT run the migration again (no redundant writes).
- A custom plan (not in `DEFAULT_DATA`) with missing `keysShipping` also receives the migration.

#### readConfig / writeConfig round-trips
- Write config with `writeConfig({ user: "u", pass: "p" })` and read it back; assert round-trip fidelity.
- Deep-merge: write a config with only `smtp.host` set; `readConfig()` fills in other smtp fields from `DEFAULT_CONFIG`.

#### writeAuthority / readAuthority round-trip
- Write an authority doc `{ data: "base64abc", filename: "test.pdf", contentType: "application/pdf" }` for order `"ORD-TEST"` and read it back; assert all fields match.
- `readAuthority("ORD-MISSING")` returns `null` for a non-existent order.

#### createSession / validToken round-trip (against real HMAC using real env)
- `createSession("admin@test.com")` returns a token that passes `validToken()` immediately.
- An expired token (use `vi.setSystemTime` to advance the clock past 8 hours) fails `validToken()`.
- A token signed with a different secret fails `validToken()`.

#### Auth token invalidation on password change
- Create a session, change `cfg.pass` via `writeConfig`, call `validToken` on the original token; it should fail because the HMAC key changed.

---

### 5.2 `api/orders/index.integration.test.js`

Integration test for the full `POST /api/orders` handler against real Redis. Stripe and SMTP are mocked.

#### Full non-Stripe order placement flow
- POST a valid OC order with bank payment; verify the order appears in `readData().orders[0]`.
- Verify `order.auditLog` contains the `"Order created"` entry.
- Verify authority doc is saved under `tocs:authority:<orderId>`.
- Verify `emailSentTo` is returned in the response.

#### Full Stripe order placement flow
- POST an order with `payment: "stripe"` and `STRIPE_SECRET_KEY` set (mocked Stripe); verify the order is saved in Redis with `stripeSessionId` set.
- Verify response contains `{ id, redirect }`.

#### Authority doc saved to Redis
- POST an order with `lotAuthority.data` present; verify `readAuthority(order.id)` returns the doc.

### 5.3 `api/orders/[id]/[action].integration.test.js`

Integration test for all actions in the merged handler against real Redis.

#### Status update round-trip
- Seed an order in Redis; PUT `status: "Paid"`; verify `readData().orders[0].status === "Paid"`.
- Verify the audit log entry is appended correctly.

#### Order cancellation with reason
- Seed an order; PUT `status: "Cancelled"` with `note: "Customer requested"`; verify `cancelReason` is set.

#### Order delete
- Seed two orders; DELETE first order; verify only the second remains in `readData().orders`.

#### stripe-confirm idempotency
- Seed an order with `status: "Paid"` and a valid `stripeSessionId`; POST `stripe-confirm`; verify it returns 200 without calling Stripe API or sending emails.

---

## 6. E2E Test Plan

All E2E tests are in `e2e/`. Test file names use the pattern `<area>.e2e.js`. They run against the local dev server (`server.js`) with a test Redis instance pre-seeded with `DEFAULT_DATA`.

The `e2e/fixtures/` directory contains:
- `authority-doc.pdf` — a 1-page valid PDF (minimum 100 bytes, not empty)
- `authority-doc.png` — a small PNG image

### 6.1 `e2e/purchase-flow-oc.e2e.js` — OC Certificate purchase flow

#### Happy path: Bank Transfer
1. Navigate to `/`; verify the plan search input is visible.
2. Type `"Harbour"` in the search box; verify `"Harbour View Residences"` appears in the results list.
3. Click the plan; verify it is highlighted.
4. Click `"OC Certificates"` category card.
5. Click `"Continue"`.
6. Select `"Lot 1"` from the lot selector.
7. Verify OC pills show `"Owner Corporation A — Residential"`.
8. Select `"Owner"` applicant type; enter `"Test Owner"` as owner name.
9. Upload `fixtures/authority-doc.pdf` via the file input.
10. Click `"Add"` on `"OC Certificate — Standard"`.
11. Verify the `"Added"` indicator appears.
12. Click `"Review Order"`.
13. Verify step 3 shows the item, its price (`$220.00`), and the GST breakdown.
14. Select `"Standard Post"` shipping (if the plan has shipping options; verify the cost appears).
15. Click `"Enter Contact Details"`.
16. Fill in Full Name, Email, Phone (Australian format).
17. Click `"Choose Payment"`.
18. Select `"Direct Bank Transfer"`.
19. Verify bank account details (account name, BSB, account number) are visible.
20. Click `"Confirm Order"`.
21. Verify step 6 shows the order ID, bank payment instructions, and cart summary.
22. Verify the order ID has the format `TOCS-[A-Z0-9]+-[A-Z0-9]+`.
23. Verify `localStorage.tocs_last_order` is set (check via `page.evaluate`).

#### Happy path: PayID
1. Complete steps 1–4 as above.
2. Select `"PayID"` payment method; verify PayID address appears.
3. Confirm order; verify step 6 shows PayID details.

#### Cart total verification (multi-OC lot)
1. Select `"Lot 4"` (has OC-A and OC-B).
2. Add `"OC Certificate — Standard"` (perOC: true; price $220 first OC, $150 second OC).
3. Verify step 3 shows two line items: `$220.00` (first) and `$150.00` (additional OC rate).
4. Verify total is `$370.00`.
5. Verify GST = `$370 / 11 ≈ $33.64`.

#### Validation: cart empty
1. Navigate to step 2 without adding any products; click `"Review Order"`.
2. Verify an error message about the empty cart appears.

#### Validation: owner name required
1. Select `"Owner"` applicant type; leave owner name blank; click `"Review Order"`.
2. Verify the owner name validation error appears.

#### Validation: authority doc required
1. Do not upload an authority doc; click `"Review Order"`.
2. Verify the authority doc validation error appears.

#### Validation: invalid email
1. Reach step 4; enter `"notanemail"` in the Email field; click `"Choose Payment"`.
2. Verify an email validation error appears.

#### Validation: non-Australian phone
1. Reach step 4; enter `"123456789"` in the Phone field; click `"Choose Payment"`.
2. Verify a phone validation error appears.

#### Edit cart (back navigation)
1. Reach step 3 (Review); click `"Edit"`.
2. Verify step 2 is shown with the cart still populated.

#### Cancel order (return to step 1)
1. Reach step 3; click `"Cancel"`.
2. Verify step 1 is shown and the search input is empty.

---

### 6.2 `e2e/purchase-flow-keys.e2e.js` — Keys/Fobs purchase flow

#### Happy path: Keys order with delivery
1. Select a plan; choose `"Keys / Fobs / Remotes"`.
2. Select a lot; upload authority doc.
3. Add `"Building Entry Key"` with qty `2`.
4. Click `"Review Order"`.
5. Enter contact details.
6. Select `"Standard Delivery"` shipping; fill in delivery address (Street, Suburb, State, Postcode).
7. Click `"Submit Order"`.
8. Verify step 6 shows `"Invoice will follow"` confirmation message (no bank details shown).
9. Verify the order ID is shown.

#### Happy path: Keys order with pickup
1. Complete steps 1–4.
2. Select `"Pick up from BM"` (no address form shown).
3. Submit; verify step 6 confirmation.

#### Validation: delivery address required when delivery selected
1. Select `"Standard Delivery"` but leave address fields blank.
2. Click `"Submit Order"`; verify address validation errors appear.

---

### 6.3 `e2e/stripe-flow.e2e.js` — Stripe payment flow

**Precondition:** The test Redis must have `STRIPE_SECRET_KEY` set (use a Stripe test key) and `pubConfig.stripeEnabled === true`.

#### Stripe redirect
1. Complete steps 1–5; select `"Credit / Debit Card"`.
2. Verify the `"Credit / Debit Card"` option is visible (stripeEnabled).
3. Click `"Confirm Order"`.
4. Verify the browser navigates to a URL matching `https://checkout.stripe.com/` (or the mocked redirect URL in server test mode).

#### Stripe success redirect handling
1. Navigate directly to `/complete?orderId=<id>&stripeOk=1` where `<id>` is a pre-seeded order in Redis with `status: "Awaiting Stripe Payment"` and a valid `stripeSessionId`.
2. Verify the app shows a `"Confirming your payment…"` loading state.
3. Verify the app transitions to step 6 showing `"Payment received"` confirmation.

#### Stripe cancellation banner
1. Navigate to `/?cancelled=1`.
2. Verify a dismissible cancellation banner is shown on step 1.
3. Click the dismiss button; verify the banner disappears.

#### Stripe error state
1. Navigate to `/complete?orderId=NONEXISTENT&stripeOk=1`.
2. Verify an error message and a `"Contact Support"` button are shown.

---

### 6.4 `e2e/admin-login.e2e.js` — Admin authentication

#### Happy path
1. Click `"Admin"` in the nav bar.
2. Verify the login form is shown.
3. Enter valid credentials (`testadmin@example.com` / `TestPass123!`).
4. Click `"Login"`.
5. Verify the admin panel is shown with the orders table.

#### Invalid credentials
1. Enter wrong password; click `"Login"`.
2. Verify `"Incorrect username or password."` error is shown.

#### Token persistence
1. Log in; reload the page (sessionStorage survives same tab); verify the admin panel is shown without re-login.

#### Logout
1. Log in; click `"Logout"`.
2. Verify the login form is shown again.
3. Verify `sessionStorage.admin_token` is absent (check via `page.evaluate`).

---

### 6.5 `e2e/admin-orders.e2e.js` — Admin order management

**Precondition:** Redis seeded with several orders in various statuses.

#### Order table and expand
1. Log in; navigate to the `"Orders"` tab.
2. Verify orders table renders with correct row count.
3. Click a row to expand it.
4. Verify items table, customer details, and audit log are visible.

#### Mark as Paid
1. Find an `"Awaiting Payment"` order; click `"Mark Paid"`.
2. Verify the status badge updates to `"Paid"` without a page reload (optimistic update).

#### Cancel order
1. Find a non-Cancelled, non-Issued order; click `"Cancel"`.
2. Enter a cancellation reason; check the confirmation checkbox; click `"Confirm Cancel"`.
3. Verify the status updates to `"Cancelled"`.
4. Verify a `"Delete"` button appears.

#### Delete order
1. Find a `"Cancelled"` order; click `"Delete"`; confirm the browser dialog.
2. Verify the row disappears from the table.

#### CSV export
1. Click `"Export CSV"`.
2. Verify a file download is triggered with `Content-Disposition: attachment; filename="tocs-orders-<date>.csv"`.

#### Filter by status
1. Select `"Paid"` in the status filter dropdown.
2. Verify only orders with status `"Paid"` are shown.

#### Text search
1. Type an order ID in the search box.
2. Verify only that order is shown.

#### Clear filters
1. Apply a filter; click `"Clear"`.
2. Verify all orders are shown again.

---

### 6.6 `e2e/admin-plans.e2e.js` — Admin plan management

#### Add a plan
1. Navigate to `"Plans"` tab; click `"Add Plan"`.
2. Enter Plan ID `"SP99001"`, Name `"Test Building"`, Address `"1 Test St, Sydney NSW 2000"`.
3. Click `"Save"`.
4. Verify the new plan appears in the plans table.

#### Edit a plan
1. Click `"Edit"` on the new plan; change the name to `"Updated Building"`.
2. Save; verify the updated name appears.

#### Delete a plan
1. Click `"Delete"` on the plan; confirm the browser dialog.
2. Verify the plan is removed from the table.

---

### 6.7 `e2e/admin-settings.e2e.js` — Admin settings

#### Update order notification email
1. Navigate to `"Settings"` tab.
2. Change the order notification email to `"newemail@test.com"`.
3. Click `"Save"`.
4. Reload the page; verify the saved value is shown.

#### SMTP password placeholder preserved
1. Navigate to Settings; verify SMTP password shows `"••••••••"`.
2. Leave the password field unchanged; save settings.
3. Verify SMTP password in the stored config is the original value (not replaced with the placeholder).

---

### 6.8 `e2e/recent-order-banner.e2e.js` — Recent order banner

#### Banner shown for recent order
1. Set `localStorage.tocs_last_order` to an order placed within the last 7 days (via `page.evaluate`).
2. Reload; verify the recent order banner is visible.

#### Banner not shown for old order
1. Set `localStorage.tocs_last_order` to an order placed 8 days ago.
2. Reload; verify no recent order banner is shown.

---

## 7. PRD/Code Gap Analysis

The following gaps were found between what the PRDs specify and what the code actually does. Each gap should be documented as a comment in the relevant test file.

| Gap ID | PRD Reference | Expected (PRD) | Actual (Code) | Recommendation |
|---|---|---|---|---|
| GAP-1 | US-INT-04 | Admin notification email sent after Stripe confirm, not at placement | Code in `orders/index.js` does NOT send admin email for Stripe orders at placement — correct. Code in `[action].js` sends it at stripe-confirm — correct. **No gap.** | N/A |
| GAP-2 | SEC-4 (remediation PRD) | `test-sharepoint.js` must call `validToken()` | Code only checks `if (!auth)` — any non-empty string passes | Test both current behaviour and expected behaviour; flag as SEC-4 TODO |
| GAP-3 | SEC-5 (remediation PRD) | Order ID generated server-side | Order ID is generated by the frontend (`genOrderId()`) and accepted verbatim by `POST /api/orders` | Test that the server accepts a client-supplied ID (current behaviour); flag as SEC-5 TODO |
| GAP-4 | US-AP-12 | SMTP password masked placeholder preserved if submitted | Code checks `smtp.pass !== "••••••••"` — correct. **No gap.** | N/A |
| GAP-5 | US-INT-03 | Each SharePoint upload uses an 8000ms `AbortController` timeout | Only the `uploadToSharePoint` function in `sharepoint.js` sets the AbortController. The integration point in `orders/index.js` does not set its own timeout on the SP promise. | Test that SP upload failure does not block the HTTP response |
| GAP-6 | US-OF-09 | OC + Invoice payment → status "Paid" | Code in `orders/index.js` does not set status — the status is set client-side and sent in `order.status`. Server accepts it verbatim. No server-side status derivation exists. | Flag as FE-1 / SEC-5 concern; test that the server currently accepts any `status` value in the order body |
| GAP-7 | design/api.md `stripe-confirm` | Response 200 `{ "success": true, "order": Order }` | Code returns `res.status(200).json({ success: true, order: confirmedOrder })` where `confirmedOrder = data.orders[idx]` (before SP writes) — SP URL fields may be absent from the response. | Test that the returned order object reflects the `"Paid"` status; note that SP URLs are only written after the response is sent |
| GAP-8 | `send-certificate` action | Uses `createTransporter` from `_lib/email.js` | The `send-certificate` and `send-invoice` handlers construct a local `nodemailer.createTransport` directly (NOT using `createTransporter` from `_lib/email.js`). This means `connectionTimeout` and `socketTimeout` are NOT set on these calls, and `greetingTimeout` is absent by coincidence only. | Flag as technical debt; test that the transporter used in these handlers does NOT set `connectionTimeout` (current behaviour) |

---

## 8. Vertical Slices

The test suite is decomposed into independently implementable slices. Each slice is a self-contained branch with its own tests and no shared in-flight state with other slices.

### Dependency graph

```
Slice A (store.js unit tests)
  └─ Slice B (integration tests — real Redis)
       └─ Slice E (handler integration tests)

Slice C (email + pdf + sharepoint unit tests)  [independent of A/B]

Slice D (handler unit tests)                   [depends on A for mock contracts]

Slice F (E2E — purchase flow)                  [depends on A, B, D being merged]
Slice G (E2E — admin panel)                    [depends on A, B, D being merged]
```

---

### Slice A — `api/_lib/store.js` unit tests

**Branch:** `test/slice-a-store-unit`
**Files created:**
- `vitest.config.js`
- `package.json` (add `vitest`, `@vitest/coverage-v8` to devDependencies; add test scripts)
- `test/setup.js`
- `test/redis-helpers.js`
- `test/request-factory.js`
- `api/_lib/store.test.js`

**Coverage target:** 100% lines on `api/_lib/store.js`
**Dependencies:** None
**Can run in parallel with:** Slice C

---

### Slice B — `api/_lib/store.js` integration tests

**Branch:** `test/slice-b-store-integration`
**Files created:**
- `api/_lib/store.integration.test.js`

**Coverage target:** Exercises all branches in `readData()` migration logic, `readConfig()` merge logic, and token round-trips
**Dependencies:** Slice A merged (for `test/setup.js` and `test/redis-helpers.js`)
**Can run in parallel with:** Slice C

---

### Slice C — `api/_lib/email.js`, `api/_lib/pdf.js`, `api/_lib/sharepoint.js` unit tests

**Branch:** `test/slice-c-lib-unit`
**Files created:**
- `test/nodemailer-mock.js`
- `test/stripe-mock.js`
- `test/sharepoint-mock.js`
- `api/_lib/email.test.js`
- `api/_lib/pdf.test.js`
- `api/_lib/sharepoint.test.js`

**Coverage target:** 100% lines on all three files
**Dependencies:** None (Slice A is not required — these tests don't touch store.js)
**Can run in parallel with:** Slice A

---

### Slice D — API handler unit tests

**Branch:** `test/slice-d-handler-unit`
**Files created:**
- `api/auth/login.test.js`
- `api/auth/change-credentials.test.js`
- `api/config/public.test.js`
- `api/config/settings.test.js`
- `api/config/test-email.test.js`
- `api/config/test-sharepoint.test.js`
- `api/data.test.js`
- `api/plans.test.js`
- `api/lots/import.test.js`
- `api/orders/export.test.js`
- `api/orders/index.test.js`
- `api/orders/[id]/[action].test.js`

**Coverage target:** 100% lines on all handler files
**Dependencies:** Slice A merged (for `test/request-factory.js` and mock contracts), Slice C merged (for nodemailer/Stripe/SharePoint mocks)
**Can run in parallel with:** Slice B

---

### Slice E — Handler integration tests

**Branch:** `test/slice-e-handler-integration`
**Files created:**
- `api/orders/index.integration.test.js`
- `api/orders/[id]/[action].integration.test.js`

**Dependencies:** Slice A, Slice B (for redis-helpers), Slice C (for mocks)
**Can run in parallel with:** Slice F and G after prerequisite slices are merged

---

### Slice F — E2E: Purchase flow tests

**Branch:** `test/slice-f-e2e-purchase`
**Files created:**
- `playwright.config.js`
- `package.json` update (add `@playwright/test`; add `test:e2e` script)
- `e2e/fixtures/authority-doc.pdf`
- `e2e/fixtures/authority-doc.png`
- `e2e/purchase-flow-oc.e2e.js`
- `e2e/purchase-flow-keys.e2e.js`
- `e2e/stripe-flow.e2e.js`
- `e2e/recent-order-banner.e2e.js`

**Dependencies:** Slices A–E merged (requires stable API handlers and Redis helpers for seeding)
**Can run in parallel with:** Slice G

---

### Slice G — E2E: Admin panel tests

**Branch:** `test/slice-g-e2e-admin`
**Files created:**
- `e2e/admin-login.e2e.js`
- `e2e/admin-orders.e2e.js`
- `e2e/admin-plans.e2e.js`
- `e2e/admin-settings.e2e.js`

**Dependencies:** Slices A–E merged
**Can run in parallel with:** Slice F

---

## Schema Migration Required

No — the test suite adds no new Redis schema. It uses the existing `tocs:data` and `tocs:config` keys with the existing schema, plus a flush before each integration test.

---

## E2E Test Scenarios (summary — existing specs affected)

All E2E scenarios defined in `prd/order-flow.md` and `prd/admin-panel.md` are addressed by Slices F and G respectively. Changes to any of the following components require updating the corresponding E2E files:

| Component changed | E2E files to update |
|---|---|
| Step navigation logic in `App.jsx` | `e2e/purchase-flow-oc.e2e.js`, `e2e/purchase-flow-keys.e2e.js` |
| `placeOrder()` function | All purchase flow E2E files |
| Stripe redirect handling | `e2e/stripe-flow.e2e.js` |
| Admin order actions | `e2e/admin-orders.e2e.js` |
| Admin plan/lot management | `e2e/admin-plans.e2e.js` |
| Admin settings | `e2e/admin-settings.e2e.js` |
| Auth / session handling | `e2e/admin-login.e2e.js` |
