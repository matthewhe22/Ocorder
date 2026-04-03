# PIQ Sync All Buildings — Design Spec
**Date:** 2026-04-03
**Status:** Approved

---

## Overview

Extend "Sync All from PIQ" so it discovers buildings that exist in PropertyIQ but are not yet in the Plans page, creates plan stubs for them (with products copied from a user-selected template plan), and runs the existing per-plan sync to populate OCs + lots. Also adds sortable columns to the Plans table and multi-select delete for plans.

---

## Backend Changes

### 1. New PIQ helper — `getAllPiqBuildings(cfg)` in `api/_lib/piq.js`

- Calls `GET /buildings` without an `splan` filter
- Pages through results using the same `PAGE_SIZE = 100` pattern as `getPiqLots`
- Returns a flat array of `{ id, splan, name }` objects (mapped from `buildingName || name`)

### 2. New API action — `POST /api/config/settings?action=list-piq-buildings`

- Added to `api/config/settings.js` (no new file — stays within Vercel 12-function limit)
- Admin-gated (Bearer token required)
- Calls `getAllPiqBuildings(cfg)` and returns:
  ```json
  { "ok": true, "buildings": [{ "piqBuildingId": 1, "splan": "SP12345", "name": "Harbour View" }] }
  ```
- On failure: returns `{ "ok": false, "error": "..." }`

---

## Frontend Changes (`OCOrder/src/App.jsx`)

### 3. Plans table — sortable columns

- All column headers in the plans list table become clickable sort toggles (asc → desc → asc)
- Sort state: local `useState({ col: null, dir: "asc" })`; no persistence across page loads
- Sortable columns: Plan ID, Building Name, Active status, Lot count
- Visual indicator: ▲ / ▼ chevron on the active sort column header

### 4. Plans table — multi-select delete

- Each plan row gets a checkbox on the left
- "Select All" checkbox in the table header toggles all rows
- When 1+ rows selected, a **"Delete Selected"** button appears above the table (red, destructive)
- Each row also has a single **"Delete"** icon button for one-plan deletion
- Both trigger a confirmation dialog:
  - Generic: *"Delete X plan(s)? This cannot be undone."*
  - If any selected plan has existing orders (checked client-side against `data.orders`): *"X of these plans have existing orders. Deleting will not remove orders but they will reference a plan that no longer exists."*
- On confirm: remove selected plans from `strataPlans`, save via `POST /api/plans`

### 5. Sync All modal — pre-sync template selection

Before sync starts, the modal shows:
- **"Template plan"** dropdown listing all existing plans by name
- **"Start Sync"** button — disabled until a template is selected
- On selection, stores `templatePlanId` in modal state

### 6. Extended `syncAllFromPiq` flow

```
1. Show modal with template-plan dropdown (wait for admin to select + click Start)
2. Call POST /api/config/settings?action=list-piq-buildings
   → On failure: show error in modal, stop
3. Diff PIQ buildings against existing strataPlans:
   - Match if: plan.piqBuildingId === building.piqBuildingId
             OR plan.id.toLowerCase() === building.splan?.toLowerCase()
   - Matched plans → skip (existing sync handles them)
   - Unmatched buildings → create stubs (see below)
4. Append stubs to updatedPlans
5. Run existing per-plan sync loop over ALL plans (existing + stubs)
   - Each stub gets OCs + lots populated by sync-piq
   - Progress table shows stubs with a "New" badge
6. Save all plans via POST /api/plans
```

**New plan stub shape:**
```json
{
  "id": "",
  "name": "<PIQ building name>",
  "piqBuildingId": "<PIQ id>",
  "active": true,
  "ownerCorps": {},
  "lots": [],
  "products": "<deep copy from template plan>",
  "shippingOptions": "<copy from template plan>",
  "keysShipping": "<copy from template plan>"
}
```

---

## Error Handling & Edge Cases

| Scenario | Behaviour |
|---|---|
| `list-piq-buildings` fails | Modal shows error, sync stops, admin can close and retry |
| Per-plan sync fails on a stub | Row shows error badge; stub still included in final save |
| PIQ building has no `splan` | Stub created with `id: ""`, admin fills in both ID and name |
| Template plan has no products | Stubs get `products: []`; modal shows warning note |
| Stub with `id: ""` on next Sync All | Treated as new again (no splan to match); admin should assign ID before re-syncing |
| Selected plans have existing orders | Confirmation dialog warns before deleting |

---

## Out of Scope

- Server-side order-plan integrity checks on delete
- Pagination on the Plans table
- Persisting sort state across sessions
