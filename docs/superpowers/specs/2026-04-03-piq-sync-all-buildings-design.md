# PIQ Sync All Buildings — Design Spec
**Date:** 2026-04-03
**Status:** Approved

---

## Overview

Extend "Sync All from PIQ" so it discovers buildings that exist in PropertyIQ but are not yet in the Plans page, creates plan stubs for them (with products copied from a user-selected template plan), and runs the existing per-plan sync to populate OCs + lots. Also adds sortable columns to the Plans table and multi-select delete for plans.

---

## Backend Changes

### 1. `getAllPiqBuildings(cfg)` in `api/_lib/piq.js`

- Calls `GET /buildings` using `piqGet()` (the existing internal helper — not raw `fetch`) with `number: 100`
- **Single page only** — no pagination loop. Vercel Hobby has a 10-second function timeout; one page with `piqGet()`'s 12-second `AbortSignal` already risks a 504. A single call stays safe.
- If exactly 100 buildings are returned, set `warning: "Only the first 100 buildings were returned. If your account has more, some may not appear."` — the implementer should NOT assume the list is complete in that case.
- **Empty result fallback:** returns `[]` + `warning: "No buildings returned from PIQ — verify API access and credentials."`
- Returns `{ buildings: [{ piqBuildingId, splan, name }], warning? }` where:
  - `piqBuildingId` = raw `id` field, renamed here
  - `name` = `building.buildingName || building.name` (mirrors existing `sync-piq` usage at line 136 of `settings.js`)
  - `splan` = `building.splan` (confirmed present on PIQ building objects — existing `piq.js` line 109 accesses `b.splan`)

### 2. New API action `POST /api/config/settings?action=list-piq-buildings`

- Added to `api/config/settings.js` (no new file — stays within Vercel 12-function limit)
- Admin-gated (Bearer token required)
- Calls `getAllPiqBuildings(cfg)` and returns:
  ```json
  { "ok": true, "buildings": [{ "piqBuildingId": 1, "splan": "SP12345", "name": "Harbour View" }] }
  ```
  Optional `"warning"` field included when empty or capped.
- On failure: `{ "ok": false, "error": "..." }`

### 3. Extended `sync-piq` action in `api/config/settings.js`

The existing guard `if (!planId) return res.status(400)…` (line 107) is **replaced** with mutual-exclusion logic:

```js
const { planId, piqBuildingId } = req.body || {};
if (!planId && !piqBuildingId) return res.status(400).json({ error: "Provide planId or piqBuildingId." });
if (planId  &&  piqBuildingId) return res.status(400).json({ error: "Provide planId or piqBuildingId, not both." });
```

- **`{ planId }` branch (unchanged):** calls `getPiqBuilding(cfg, planId)` to resolve the building; returns `{ ok, piqBuildingId, buildingName, schedules, lots }`
- **`{ piqBuildingId }` branch (new):** skips `getPiqBuilding`; calls `getPiqSchedules(cfg, piqBuildingId)` + `getPiqLots(cfg, piqBuildingId)` directly; **omits `buildingName` from the response** (caller already has the name from `list-piq-buildings`); returns `{ ok, piqBuildingId, schedules, lots }`

---

## Frontend Changes (`OCOrder/src/App.jsx`)

### 4. Plans table — sortable columns

- Column headers become clickable sort toggles: asc → desc → asc (cycling)
- Sort state: `useState({ col: null, dir: "asc" })` — local, not persisted
- Sortable columns: **Plan ID**, **Building Name**, **Lot count**, **Product count**
- Visual indicator: ▲ for asc, ▼ for desc on the active column header
- Sorted list derived via `useMemo([data.strataPlans, sortState])`

### 5. Plans table — multi-select delete

**Checkbox state:** `useState(new Set())` of selected plan IDs. All operations key by plan `id` — never array index.

**Select All checkbox** (table header): toggles all plan IDs in the current sorted list in/out of the set.

**Per-row checkbox:** toggles that plan's `id` in/out of the set.

**"Delete Selected" button:** visible when `selectedIds.size > 0`; red, destructive styling; appears above the table.

**Single-row "Delete" icon:** calls `confirmDeletePlans([plan.id])`.

**`confirmDeletePlans(planIds: string[])` — replaces `deletePlan` entirely:**
1. Builds message: *"Delete X plan(s)? This cannot be undone."*
2. Client-side order check: if `data.orders.some(o => o.items?.[0]?.planId === id)` for any `id`, appends: *"\n\nOne or more of these plans have existing orders. Deleting will not remove orders but they will reference a plan that no longer exists."*
3. Calls `window.confirm(message)` (consistent with all other destructive operations in the existing codebase)
4. **On confirm:**
   - Filter out selected plans from `strataPlans` → `updatedPlans`
   - Save via `POST /api/plans`
   - `setData(p => ({ ...p, strataPlans: updatedPlans }))`
   - Reset `selectedIds` to empty Set
   - **If the currently-selected `planId` is in the deleted set:** reset `planId` to `updatedPlans[0]?.id || ""` (prevents dangling planId breaking Products/Lots/OwnerCorps tabs)
5. **On cancel:** do nothing; selected set is preserved

The old `deletePlan` function is **removed**. All references to it are updated to call `confirmDeletePlans([id])`.

### 6. Sync All modal — fully replaces existing `piqSyncAllModal` state and JSX

The existing state `{ running, rows, done, saveErr }` and its modal JSX (lines 3241–3287) are **replaced in full**. New state:

```js
{
  phase:          "select" | "syncing" | "done",
  templatePlanId: null | string,
  rows: [
    {
      planId:        string,   // plan.id or stub id — used as React key
      planName:      string,   // set at stub creation time; NOT from sync-piq response
      piqBuildingId: number | null,  // null for existing plans without it
      isNew:         boolean,
      status:        "pending" | "running" | "ok" | "err",
      ocs:           number,
      lots:          number,
      err:           string | null,
    }
  ],
  warning:  null | string,  // from list-piq-buildings (pagination cap or empty result)
  error:    null | string,  // set on list-piq-buildings failure; rendered in phase "done"
  saveErr:  null | string,  // set on POST /api/plans failure
}
```

**Phase "select":**
- Template plan dropdown: lists all currently saved `data.strataPlans` sorted alphabetically by name
- Plans with no products show a `(no products)` suffix — not excluded
- "Start Sync" button disabled until `templatePlanId !== null`
- "Cancel" closes modal

**Phase "done":**
- If `error` is set: render error message (the list-buildings call failed; no sync was attempted)
- If `saveErr` is set: render save failure message
- Otherwise: render success summary
- "Close" button always shown

**Phase "syncing":** row-progress table; `warning` from discovery shown at top if present; "New" badge on `isNew` rows.

### 7. Extended `syncAllFromPiq` flow — replaces existing function

```
1. Open modal in phase "select"
2. Admin selects template plan and clicks Start
3. Transition to phase "syncing"

4. Call POST /api/config/settings?action=list-piq-buildings
   → On failure (ok:false or network error):
       Set modal.error = error message; transition to phase "done"; stop
   → If response.warning present: set modal.warning

5. Diff PIQ buildings vs existing strataPlans
   A plan "matches" a building if:
     plan.piqBuildingId === building.piqBuildingId
     OR plan.id.toLowerCase() === building.splan?.trim().toLowerCase()  // trim applied consistently
   Matched → skip (existing sync loop handles)
   Unmatched → create stub

6. Stub ID assignment (guaranteed non-empty, unique):
   candidate = building.splan?.trim() || `piq-${building.piqBuildingId}`
   If candidate already exists as a plan.id in updatedPlans:
     candidate = `piq-${building.piqBuildingId}`
   If that still collides (edge: admin manually created plan with that ID):
     candidate = `piq-${building.piqBuildingId}-dup`
   PIQ building IDs are unique per tenant (database PKs), so -dup suffix is sufficient.

7. Build:
   updatedPlans = [...existingPlans (unchanged), ...stubs]
   Invariant: updatedPlans.length >= existingPlans.length (no existing plans removed)
   rows = existingPlan rows (isNew:false, piqBuildingId from plan.piqBuildingId or null)
        + stub rows (isNew:true, piqBuildingId: building.piqBuildingId, planName: building.name)
   rows mirrors updatedPlans order 1:1

8. Sync loop — iterates updatedPlans directly (NOT via original plans[] index):
   for (let i = 0; i < updatedPlans.length; i++) {
     Update rows[i].status to "running"
     if (rows[i].isNew && rows[i].piqBuildingId != null) {
       body = { piqBuildingId: rows[i].piqBuildingId }
     } else {
       body = { planId: updatedPlans[i].id }
     }
     fetch POST /api/config/settings?action=sync-piq with body
     Merge d.schedules → updatedPlans[i].ownerCorps (existing merge logic unchanged)
     Merge d.lots → updatedPlans[i].lots (existing merge logic unchanged)
       Note: ownerName from PIQ lots is discarded — same as existing behaviour, not stored on lot objects
     Do NOT overwrite updatedPlans[i].name (buildingName absent for stub branch)
     Update rows[i].status to "ok" or "err"
   }

9. Save updatedPlans via POST /api/plans
10. setData(p => ({ ...p, strataPlans: updatedPlans })) on success; phase "done"
    On save failure: set modal.saveErr; phase "done"
```

**New plan stub shape:**
```js
{
  id:              <from step 6>,
  name:            building.name,
  piqBuildingId:   building.piqBuildingId,
  active:          true,
  address:         "",
  ownerCorps:      {},
  lots:            [],
  products:        JSON.parse(JSON.stringify(templatePlan.products        || [])),
  shippingOptions: JSON.parse(JSON.stringify(templatePlan.shippingOptions || [])),
  keysShipping:    JSON.parse(JSON.stringify(
                     templatePlan.keysShipping || { deliveryCost: 0, expressCost: 0 }
                   )),
}
```

**Re-matching on next Sync All:** Stubs store `piqBuildingId`, so matched via `plan.piqBuildingId === building.piqBuildingId` on subsequent runs — treated as existing plans, not re-created.

---

## Error Handling & Edge Cases

| Scenario | Behaviour |
|---|---|
| `list-piq-buildings` fails | `modal.error` set; phase "done"; stop; no sync attempted |
| Returns 0 buildings | `modal.warning` set; sync loop runs over existing plans only |
| Returns exactly 100 buildings | `modal.warning` shown: list may be incomplete |
| Per-plan sync fails on a stub | Error badge; stub still included in final save |
| PIQ building has no splan | ID = `piq-{piqBuildingId}`; admin renames in Plans tab |
| Template plan has no products | `products: []`; `(no products)` shown in dropdown |
| Stub on next Sync All | Matched by `piqBuildingId` — treated as existing |
| Selected plans have existing orders | `window.confirm()` message includes warning |
| Multiple no-splan buildings | Each gets unique `piq-{piqBuildingId}` |
| `piq-{id}` collides with existing plan ID | Falls back to `piq-{id}-dup` |
| Currently-selected `planId` deleted | `planId` reset to first remaining plan's ID |

---

## Out of Scope

- Server-side order-plan integrity checks on delete
- Plans table pagination
- Persisting sort state across sessions
- Filtering template dropdown by product count
- Modal-style confirmation for delete (deferred; `window.confirm()` used for consistency)
