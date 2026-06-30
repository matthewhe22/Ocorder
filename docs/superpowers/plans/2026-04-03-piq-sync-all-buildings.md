# PIQ Sync All Buildings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend "Sync All from PIQ" to discover new PIQ buildings and import them as plan stubs; add sortable columns and multi-select delete to the Plans table.

**Architecture:** Three backend changes in `api/_lib/piq.js` and `api/config/settings.js` add a building-list endpoint and extend the existing sync action. All frontend changes are in `OCOrder/src/App.jsx` — new state, updated table JSX, a rewritten `syncAllFromPiq` function, and a replaced modal. The build step compiles App.jsx into `OCOrder/dist/`.

**Tech Stack:** Vercel serverless (ESM), React 18 (no JSX transform — esbuild), Redis/Upstash KV, esbuild bundler (`OCOrder/build.mjs`).

---

## Chunk 1: Backend

### Task 1: Add `getAllPiqBuildings` helper to `api/_lib/piq.js`

**Files:**
- Modify: `api/_lib/piq.js` (add new export after `getPiqLotLedger`)

**Context:** `piq.js` already has `piqGet()` (line 80) as the internal GET helper. All new code uses it. The PIQ `/buildings` endpoint accepts `number` as a page size — same pattern as `/buildings/{id}/lots`. Raw field `id` is renamed to `piqBuildingId` before returning.

- [ ] **Step 1: Add `getAllPiqBuildings` export after `getPiqLotLedger`**

Add the following at the end of `api/_lib/piq.js` (after the closing brace of `getPiqLotLedger`):

```js
/**
 * List all buildings in the PIQ tenant (single page, max 100).
 * Returns { buildings: [{ piqBuildingId, splan, name }], warning? }
 *
 * Single-page only — avoids Vercel 10s timeout with multiple round-trips.
 * If exactly 100 results are returned, a warning is set (list may be incomplete).
 */
export async function getAllPiqBuildings(cfg) {
  const { access_token, baseUrl } = await getPiqToken(cfg);
  const result = await piqGet(access_token, baseUrl, "/buildings", { number: 100 });
  const list   = Array.isArray(result) ? result : (result?.data || []);

  const buildings = list.map(b => ({
    piqBuildingId: b.id,
    splan:         b.splan || null,
    name:          b.buildingName || b.name || `Building ${b.id}`,
  }));

  let warning = null;
  if (buildings.length === 0) {
    warning = "No buildings returned from PIQ — verify API access and credentials.";
  } else if (buildings.length === 100) {
    warning = "Only the first 100 buildings were returned. If your account has more, some may not appear.";
  }

  return { buildings, warning };
}
```

- [ ] **Step 2: Verify the file parses correctly**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev
node --input-type=module --eval "import('./api/_lib/piq.js').then(m => console.log('exports:', Object.keys(m).join(', ')))"
```

Expected output includes: `getAllPiqBuildings`

- [ ] **Step 3: Commit**

```bash
git add api/_lib/piq.js
git commit -m "feat: add getAllPiqBuildings helper to piq.js"
```

---

### Task 2: Add `list-piq-buildings` action to `api/config/settings.js`

**Files:**
- Modify: `api/config/settings.js` (add new action block before the existing `sync-piq` block at line 100)

**Context:** All action blocks use the same pattern: `if (req.method === "POST" && req.query?.action === "X") { ... }`. The import on line 2 already imports from `piq.js` — extend it to add `getAllPiqBuildings`.

- [ ] **Step 1: Update the import on line 2 of `api/config/settings.js`**

Change:
```js
import { getPiqToken, getPiqBuilding, getPiqSchedules, getPiqLots } from "../_lib/piq.js";
```
To:
```js
import { getPiqToken, getPiqBuilding, getPiqSchedules, getPiqLots, getAllPiqBuildings } from "../_lib/piq.js";
```

- [ ] **Step 2: Add the `list-piq-buildings` action block**

Insert the following block immediately **before** the line `// POST /api/config/settings?action=sync-piq` (currently line 100):

```js
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

```

- [ ] **Step 3: Verify the file parses correctly**

```bash
node --input-type=module --eval "
import('./api/config/settings.js').then(() => console.log('OK')).catch(e => console.error(e.message))
"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add api/config/settings.js
git commit -m "feat: add list-piq-buildings API action"
```

---

### Task 3: Extend `sync-piq` action to accept `piqBuildingId` directly

**Files:**
- Modify: `api/config/settings.js` (replace lines 104–140 — the existing `sync-piq` block)

**Context:** New stubs from discovery already have `piqBuildingId` — sending it directly skips the splan lookup. The old guard `if (!planId) return 400` becomes mutual-exclusion logic. `buildingName` is omitted from the response when `piqBuildingId` is used (caller already has the name).

- [ ] **Step 1: Replace the `sync-piq` block**

Find and replace the entire block from `// POST /api/config/settings?action=sync-piq` through its closing `}` (the block ending at line 140). Replace with:

```js
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

      let piqBuildingId, buildingName;

      if (planId) {
        // Original path: find building by splan
        const building = await getPiqBuilding(cfg, planId);
        if (!building) return res.status(404).json({ error: `No PIQ building found for splan "${planId}".` });
        piqBuildingId = building.id;
        buildingName  = building.buildingName || building.name;
      } else {
        // New path: piqBuildingId supplied directly — skip splan lookup
        piqBuildingId = bodyBuildingId;
        buildingName  = undefined; // caller already has the name from list-piq-buildings
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

      // Map PIQ lots → platform lot format
      const lots = rawLots.map(l => ({
        piqLotId:   l.id,
        lotNumber:  l.lotNumber  || l.number || String(l.id),
        unitNumber: l.unitNumber || "",
        ownerName:  l.ownerContact?.name || l.name || "",
      }));

      const response = { ok: true, piqBuildingId, schedules, lots };
      if (buildingName !== undefined) response.buildingName = buildingName;
      return res.status(200).json(response);
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }
```

- [ ] **Step 2: Verify the file parses correctly**

```bash
node --input-type=module --eval "
import('./api/config/settings.js').then(() => console.log('OK')).catch(e => console.error(e.message))
"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add api/config/settings.js
git commit -m "feat: extend sync-piq to accept piqBuildingId directly"
```

---

## Chunk 2: Frontend State & Logic

All changes in this chunk are in `OCOrder/src/App.jsx`. The file is ~4 900 lines; edits are surgical — no restructuring.

### Task 4: Add sort state and `confirmDeletePlans`

**Files:**
- Modify: `OCOrder/src/App.jsx`

**Context:**
- `piqSyncAllModal` state is at line 2178. Add new state declarations immediately after it.
- `deletePlan` function is at lines 2435–2440. It is replaced entirely.
- `savePlans` (line 2389) is used internally — `confirmDeletePlans` calls it.

- [ ] **Step 1: Add sort state and selectedIds state after line 2178**

Find:
```js
  const [piqSyncAllModal, setPiqSyncAllModal] = useState(null); // { running, rows:[{planId,status,ocs,lots,err}], done }
```

Replace with:
```js
  const [piqSyncAllModal, setPiqSyncAllModal] = useState(null); // { phase, templatePlanId, rows, warning, error, saveErr }
  const [planSort, setPlanSort] = useState({ col: null, dir: "asc" });
  const [selectedPlanIds, setSelectedPlanIds] = useState(new Set());
```

- [ ] **Step 2: Add `sortedPlans` derived value**

Find the line (around line 2384):
```js
  const plan = (data.strataPlans || []).find(p => p.id === planId);
```

Insert immediately **before** that line:

```js
  const sortedPlans = useMemo(() => {
    const plans = data.strataPlans || [];
    if (!planSort.col) return plans;
    return [...plans].sort((a, b) => {
      let va, vb;
      if (planSort.col === "id")       { va = a.id || "";       vb = b.id || ""; }
      else if (planSort.col === "name"){ va = a.name || "";     vb = b.name || ""; }
      else if (planSort.col === "lots"){ va = (a.lots || []).length; vb = (b.lots || []).length; }
      else                             { va = (a.products || []).length; vb = (b.products || []).length; }
      if (typeof va === "string") return planSort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return planSort.dir === "asc" ? va - vb : vb - va;
    });
  }, [data.strataPlans, planSort]);

```

- [ ] **Step 3: Replace `deletePlan` with `confirmDeletePlans`**

Find and replace the entire `deletePlan` function (lines 2435–2440):

```js
  const deletePlan = async (id) => {
    if (!window.confirm("Delete this strata plan and all its lots, products and Owner Corporations? This cannot be undone.")) return;
    const plans = data.strataPlans.filter(p => p.id !== id);
    await savePlans(plans);
    if (planId === id) setPlanId(plans[0]?.id || "");
  };
```

Replace with:

```js
  const confirmDeletePlans = async (ids) => {
    const idSet = new Set(ids);
    let msg = `Delete ${ids.length} plan(s)? This cannot be undone.`;
    const hasOrders = (data.orders || []).some(o => idSet.has(o.items?.[0]?.planId));
    if (hasOrders) msg += "\n\nOne or more of these plans have existing orders. Deleting will not remove orders but they will reference a plan that no longer exists.";
    if (!window.confirm(msg)) return;
    const plans = (data.strataPlans || []).filter(p => !idSet.has(p.id));
    await savePlans(plans);
    setSelectedPlanIds(new Set());
    if (idSet.has(planId)) setPlanId(plans[0]?.id || "");
  };
```

- [ ] **Step 4: Build to verify no syntax errors**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev/OCOrder
node build.mjs 2>&1 | tail -5
```

Expected: `✅  Build complete → dist/` (or similar success line). Fix any errors before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev
git add OCOrder/src/App.jsx
git commit -m "feat: add plan sort state, confirmDeletePlans replaces deletePlan"
```

---

### Task 5: Rewrite `syncAllFromPiq`

**Files:**
- Modify: `OCOrder/src/App.jsx`

**Context:** The existing `syncAllFromPiq` function runs from lines 2283–2357. It is replaced in full. The new version opens a modal in `phase: "select"` first, then the user picks a template and clicks Start. The actual sync runs when `startSyncAllFromPiq` is called.

- [ ] **Step 1: Replace the existing `syncAllFromPiq` function block**

Find the entire block (from the comment `// ── PIQ Sync All:` through the final closing `};`):

```js
  // ── PIQ Sync All: sync every plan from PIQ in sequence, then save ────────────
  const syncAllFromPiq = async () => {
    const plans = data.strataPlans;
    const rows = plans.map(p => ({ planId: p.id, planName: p.name, status: "pending", ocs: 0, lots: 0, err: null }));
    setPiqSyncAllModal({ running: true, rows, done: false });

    // Work on a mutable copy of strataPlans
    const updatedPlans = plans.map(p => ({ ...p }));

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      // Update row status to running
      setPiqSyncAllModal(m => ({ ...m, rows: m.rows.map((r, ri) => ri === i ? { ...r, status: "running" } : r) }));
      try {
        const r = await fetch("/api/config/settings?action=sync-piq", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
          body: JSON.stringify({ planId: plan.id }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || "PIQ sync failed");

        // Merge OCs
        const existing = updatedPlans[i];
        existing.piqBuildingId = d.piqBuildingId;
        const existingOCs = existing.ownerCorps || {};
        for (const s of (d.schedules || [])) {
          const key = Object.keys(existingOCs).find(k => existingOCs[k].piqScheduleId === s.piqScheduleId || existingOCs[k].name?.toLowerCase() === s.name?.toLowerCase());
          if (key) { existingOCs[key].piqScheduleId = s.piqScheduleId; }
          else { existingOCs[`OC-${s.piqScheduleId}`] = { name: s.name, levy: 0, piqScheduleId: s.piqScheduleId }; }
        }
        existing.ownerCorps = existingOCs;
        const ocKeys = Object.keys(existingOCs);
        const autoOC = ocKeys.length === 1 ? ocKeys : null;

        // Merge lots
        const existingLots = existing.lots || [];
        const norm = s => String(s).trim().toLowerCase();
        for (const l of (d.lots || [])) {
          const ei = existingLots.findIndex(el => el.piqLotId === l.piqLotId || norm(el.number) === norm(l.lotNumber));
          if (ei >= 0) {
            existingLots[ei].piqLotId = l.piqLotId;
            existingLots[ei].unitNumber = l.unitNumber || existingLots[ei].unitNumber || "";
            if (autoOC && (!existingLots[ei].ownerCorps || existingLots[ei].ownerCorps.length === 0)) existingLots[ei].ownerCorps = autoOC;
          } else {
            existingLots.push({ id: `piq-${l.piqLotId}`, number: l.lotNumber, unitNumber: l.unitNumber || "", type: "", ownerCorps: autoOC || [], piqLotId: l.piqLotId });
          }
        }
        existing.lots = existingLots;
        updatedPlans[i] = existing;

        setPiqSyncAllModal(m => ({ ...m, rows: m.rows.map((r, ri) => ri === i ? { ...r, status: "ok", ocs: d.schedules?.length || 0, lots: d.lots?.length || 0 } : r) }));
      } catch (err) {
        setPiqSyncAllModal(m => ({ ...m, rows: m.rows.map((r, ri) => ri === i ? { ...r, status: "err", err: err.message } : r) }));
      }
    }

    // Save all plans
    try {
      const sr = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ plans: updatedPlans }),
      });
      if (sr.ok) {
        setData(p => ({ ...p, strataPlans: updatedPlans }));
        setPiqSyncAllModal(m => ({ ...m, running: false, done: true }));
      } else {
        const e = await sr.json();
        setPiqSyncAllModal(m => ({ ...m, running: false, done: true, saveErr: e.error || "Save failed." }));
      }
    } catch (e) {
      setPiqSyncAllModal(m => ({ ...m, running: false, done: true, saveErr: e.message }));
    }
  };
```

Replace with:

```js
  // ── PIQ Sync All: open the template-selection modal ──────────────────────────
  const syncAllFromPiq = () => {
    setPiqSyncAllModal({ phase: "select", templatePlanId: null, rows: [], warning: null, error: null, saveErr: null });
  };

  // ── PIQ Sync All: run sync after admin selects template + clicks Start ────────
  const startSyncAllFromPiq = async () => {
    const templatePlanId = piqSyncAllModal?.templatePlanId;
    const templatePlan   = (data.strataPlans || []).find(p => p.id === templatePlanId) || {};

    // Phase: syncing
    setPiqSyncAllModal(m => ({ ...m, phase: "syncing", rows: [] }));

    // Step 1: Discover all PIQ buildings
    let allBuildings = [], discoveryWarning = null;
    try {
      const r = await fetch("/api/config/settings?action=list-piq-buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Building discovery failed.");
      allBuildings     = d.buildings || [];
      discoveryWarning = d.warning   || null;
    } catch (err) {
      setPiqSyncAllModal(m => ({ ...m, phase: "done", error: err.message }));
      return;
    }

    // Step 2: Diff — find buildings not yet in strataPlans
    const existingPlans = data.strataPlans || [];
    const matchBuilding = (plan, b) =>
      (plan.piqBuildingId != null && plan.piqBuildingId === b.piqBuildingId) ||
      (b.splan && plan.id.toLowerCase() === b.splan.trim().toLowerCase());

    const newBuildings = allBuildings.filter(b => !existingPlans.some(p => matchBuilding(p, b)));

    // Step 3: Build stubs for new buildings
    const assignId = (candidate, piqBuildingId, taken) => {
      if (!taken.has(candidate)) return candidate;
      const fallback = `piq-${piqBuildingId}`;
      if (!taken.has(fallback)) return fallback;
      return `${fallback}-dup`;
    };
    const takenIds = new Set(existingPlans.map(p => p.id));
    const stubs = newBuildings.map(b => {
      const candidate = b.splan?.trim() || `piq-${b.piqBuildingId}`;
      const id = assignId(candidate, b.piqBuildingId, takenIds);
      takenIds.add(id);
      return {
        id,
        name:            b.name,
        piqBuildingId:   b.piqBuildingId,
        active:          true,
        address:         "",
        ownerCorps:      {},
        lots:            [],
        products:        JSON.parse(JSON.stringify(templatePlan.products        || [])),
        shippingOptions: JSON.parse(JSON.stringify(templatePlan.shippingOptions || [])),
        keysShipping:    JSON.parse(JSON.stringify(templatePlan.keysShipping    || { deliveryCost: 0, expressCost: 0 })),
      };
    });

    // Step 4: Build updatedPlans and rows (existing first, then stubs)
    const updatedPlans = [...existingPlans.map(p => ({ ...p })), ...stubs];
    const rows = updatedPlans.map((p, i) => ({
      planId:        p.id,
      planName:      p.name,
      piqBuildingId: p.piqBuildingId || null,
      isNew:         i >= existingPlans.length,
      status:        "pending",
      ocs:           0,
      lots:          0,
      err:           null,
    }));
    setPiqSyncAllModal(m => ({ ...m, rows, warning: discoveryWarning }));

    // Step 5: Sync loop
    const norm = s => String(s || "").trim().toLowerCase();
    for (let i = 0; i < updatedPlans.length; i++) {
      const row = rows[i];
      setPiqSyncAllModal(m => ({ ...m, rows: m.rows.map((r, ri) => ri === i ? { ...r, status: "running" } : r) }));
      try {
        const body = row.isNew && row.piqBuildingId != null
          ? { piqBuildingId: row.piqBuildingId }
          : { planId: updatedPlans[i].id };
        const r = await fetch("/api/config/settings?action=sync-piq", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || "PIQ sync failed");

        // Merge OCs
        const plan = updatedPlans[i];
        plan.piqBuildingId = d.piqBuildingId;
        const existingOCs = plan.ownerCorps || {};
        for (const s of (d.schedules || [])) {
          const key = Object.keys(existingOCs).find(k =>
            existingOCs[k].piqScheduleId === s.piqScheduleId ||
            existingOCs[k].name?.toLowerCase() === s.name?.toLowerCase()
          );
          if (key) { existingOCs[key].piqScheduleId = s.piqScheduleId; }
          else { existingOCs[`OC-${s.piqScheduleId}`] = { name: s.name, levy: 0, piqScheduleId: s.piqScheduleId }; }
        }
        plan.ownerCorps = existingOCs;
        const ocKeys = Object.keys(existingOCs);
        const autoOC = ocKeys.length === 1 ? ocKeys : null;

        // Merge lots
        const existingLots = plan.lots || [];
        for (const l of (d.lots || [])) {
          const ei = existingLots.findIndex(el =>
            el.piqLotId === l.piqLotId || norm(el.number) === norm(l.lotNumber)
          );
          if (ei >= 0) {
            existingLots[ei].piqLotId  = l.piqLotId;
            existingLots[ei].unitNumber = l.unitNumber || existingLots[ei].unitNumber || "";
            if (autoOC && (!existingLots[ei].ownerCorps || existingLots[ei].ownerCorps.length === 0))
              existingLots[ei].ownerCorps = autoOC;
          } else {
            existingLots.push({ id: `piq-${l.piqLotId}`, number: l.lotNumber, unitNumber: l.unitNumber || "", type: "", ownerCorps: autoOC || [], piqLotId: l.piqLotId });
          }
        }
        plan.lots = existingLots;
        updatedPlans[i] = plan;

        setPiqSyncAllModal(m => ({ ...m, rows: m.rows.map((r, ri) => ri === i ? { ...r, status: "ok", ocs: d.schedules?.length || 0, lots: d.lots?.length || 0 } : r) }));
      } catch (err) {
        setPiqSyncAllModal(m => ({ ...m, rows: m.rows.map((r, ri) => ri === i ? { ...r, status: "err", err: err.message } : r) }));
      }
    }

    // Step 6: Save
    try {
      const sr = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ plans: updatedPlans }),
      });
      if (sr.ok) {
        setData(p => ({ ...p, strataPlans: updatedPlans }));
        setPiqSyncAllModal(m => ({ ...m, phase: "done" }));
      } else {
        const e = await sr.json().catch(() => ({}));
        setPiqSyncAllModal(m => ({ ...m, phase: "done", saveErr: e.error || "Save failed." }));
      }
    } catch (e) {
      setPiqSyncAllModal(m => ({ ...m, phase: "done", saveErr: e.message }));
    }
  };
```

- [ ] **Step 2: Build to verify no syntax errors**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev/OCOrder
node build.mjs 2>&1 | tail -5
```

Expected: build success line. Fix any errors before continuing.

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev
git add OCOrder/src/App.jsx
git commit -m "feat: rewrite syncAllFromPiq — discovers new PIQ buildings and creates stubs"
```

---

## Chunk 3: Frontend JSX

### Task 6: Update Plans table JSX

**Files:**
- Modify: `OCOrder/src/App.jsx` — the Plans table block (~lines 2796–2816)

**Context:** Replace the static `<table>` with a version that has: sortable column headers, a Select All checkbox, per-row checkboxes, and "Delete Selected" button. The single-row "Delete" button now calls `confirmDeletePlans([p.id])`.

- [ ] **Step 1: Add "Delete Selected" button above the table**

Find:
```js
          <table className="tbl">
            <thead><tr><th>Plan ID</th><th>Name</th><th>Address</th><th>Lots</th><th>Products</th><th>Shipping</th><th></th></tr></thead>
            <tbody>
              {data.strataPlans.map(p => (
                <tr key={p.id}>
                  <td><strong style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{p.id}</strong></td>
                  <td>{p.name}</td>
                  <td style={{ fontSize: "0.78rem", color: "var(--muted)", maxWidth: 180 }}>{p.address}</td>
                  <td>{p.lots.length}</td>
                  <td>{p.products.length}</td>
                  <td style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{(p.shippingOptions || []).length} option{(p.shippingOptions || []).length !== 1 ? "s" : ""}</td>
                  <td style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button className="tbl-act-btn" onClick={() => openEditPlan(p)}><Ic n="edit" s={13}/> Edit</button>
                    <button className="tbl-act-btn" onClick={() => openManageShipping(p)}><Ic n="truck" s={13}/> Shipping</button>
                    <button className="tbl-act-btn" style={{ background:"#e8f4ff", color:"#1a5fa8", border:"1px solid #b0d4f5" }} onClick={() => openPiqSync(p.id)}><Ic n="cloud" s={13}/> Sync from PIQ</button>
                    <button className="tbl-act-btn danger" onClick={() => deletePlan(p.id)}><Ic n="trash" s={13}/> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
```

Replace with:

```js
          {selectedPlanIds.size > 0 && (
            <div style={{ marginBottom: "8px" }}>
              <button className="btn" style={{ padding:"7px 14px", fontSize:"0.75rem", background:"#fef2f2", color:"#dc2626", border:"1px solid #fca5a5" }}
                onClick={() => confirmDeletePlans([...selectedPlanIds])}>
                <Ic n="trash" s={13}/> Delete Selected ({selectedPlanIds.size})
              </button>
            </div>
          )}
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox"
                    checked={sortedPlans.length > 0 && sortedPlans.every(p => selectedPlanIds.has(p.id))}
                    onChange={e => {
                      if (e.target.checked) setSelectedPlanIds(new Set(sortedPlans.map(p => p.id)));
                      else setSelectedPlanIds(new Set());
                    }}
                  />
                </th>
                {[["id","Plan ID"],["name","Name"]].map(([col, label]) => (
                  <th key={col} style={{ cursor:"pointer", userSelect:"none" }}
                    onClick={() => setPlanSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }))}>
                    {label} {planSort.col === col ? (planSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                ))}
                <th>Address</th>
                <th style={{ cursor:"pointer", userSelect:"none" }}
                  onClick={() => setPlanSort(s => ({ col:"lots", dir: s.col === "lots" && s.dir === "asc" ? "desc" : "asc" }))}>
                  Lots {planSort.col === "lots" ? (planSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th style={{ cursor:"pointer", userSelect:"none" }}
                  onClick={() => setPlanSort(s => ({ col:"products", dir: s.col === "products" && s.dir === "asc" ? "desc" : "asc" }))}>
                  Products {planSort.col === "products" ? (planSort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th>Shipping</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedPlans.map(p => (
                <tr key={p.id}>
                  <td>
                    <input type="checkbox" checked={selectedPlanIds.has(p.id)}
                      onChange={e => setSelectedPlanIds(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id); else next.delete(p.id);
                        return next;
                      })}
                    />
                  </td>
                  <td><strong style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{p.id}</strong></td>
                  <td>{p.name}</td>
                  <td style={{ fontSize: "0.78rem", color: "var(--muted)", maxWidth: 180 }}>{p.address}</td>
                  <td>{(p.lots || []).length}</td>
                  <td>{(p.products || []).length}</td>
                  <td style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{(p.shippingOptions || []).length} option{(p.shippingOptions || []).length !== 1 ? "s" : ""}</td>
                  <td style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button className="tbl-act-btn" onClick={() => openEditPlan(p)}><Ic n="edit" s={13}/> Edit</button>
                    <button className="tbl-act-btn" onClick={() => openManageShipping(p)}><Ic n="truck" s={13}/> Shipping</button>
                    <button className="tbl-act-btn" style={{ background:"#e8f4ff", color:"#1a5fa8", border:"1px solid #b0d4f5" }} onClick={() => openPiqSync(p.id)}><Ic n="cloud" s={13}/> Sync from PIQ</button>
                    <button className="tbl-act-btn danger" onClick={() => confirmDeletePlans([p.id])}><Ic n="trash" s={13}/> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev/OCOrder
node build.mjs 2>&1 | tail -5
```

Expected: build success. Fix any errors before continuing.

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev
git add OCOrder/src/App.jsx
git commit -m "feat: Plans table — sortable columns and multi-select delete"
```

---

### Task 7: Replace the Sync All modal JSX

**Files:**
- Modify: `OCOrder/src/App.jsx` — the `{/* PIQ Sync All Modal */}` block (lines 3241–3287)

**Context:** The existing modal renders a single syncing/done view. Replace it with a three-phase modal: "select" (template dropdown), "syncing" (progress rows), "done" (success/error summary). The `startSyncAllFromPiq` function written in Task 5 is called from the "select" phase Start button.

- [ ] **Step 1: Replace the PIQ Sync All Modal JSX block**

Find the entire block starting with `{/* PIQ Sync All Modal */}` and ending with the matching closing `)}` (lines 3241–3287):

```js
      {/* PIQ Sync All Modal */}
      {piqSyncAllModal && (
        ...
      )}
```

Replace with:

```js
      {/* PIQ Sync All Modal */}
      {piqSyncAllModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
          <div style={{ background:"#fff", borderRadius:"10px", width:"100%", maxWidth:"580px", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ background:"#1a5fa8", borderRadius:"10px 10px 0 0", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ color:"#fff", fontWeight:700, fontSize:"1rem" }}>Sync All Buildings from PropertyIQ</span>
              {piqSyncAllModal.phase !== "syncing" && (
                <button onClick={() => setPiqSyncAllModal(null)} style={{ background:"none", border:"none", color:"#fff", fontSize:"1.3rem", cursor:"pointer", lineHeight:1 }}>×</button>
              )}
            </div>
            <div style={{ padding:"20px" }}>

              {/* ── Phase: select ── */}
              {piqSyncAllModal.phase === "select" && (
                <div>
                  <p style={{ fontSize:"0.85rem", color:"var(--muted)", marginBottom:"16px" }}>
                    PIQ will be queried for all buildings. New buildings (not already in Plans) will be imported as plan stubs using the products from the template plan you select below.
                  </p>
                  <label className="f-label">Template plan <span style={{ color:"#dc2626" }}>*</span></label>
                  <select className="f-select" style={{ marginBottom:"16px" }}
                    value={piqSyncAllModal.templatePlanId || ""}
                    onChange={e => setPiqSyncAllModal(m => ({ ...m, templatePlanId: e.target.value || null }))}>
                    <option value="">— select a template —</option>
                    {[...(data.strataPlans || [])].sort((a,b) => (a.name||"").localeCompare(b.name||"")).map(p => (
                      <option key={p.id} value={p.id}>{p.name}{(!p.products || p.products.length === 0) ? " (no products)" : ""}</option>
                    ))}
                  </select>
                  <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
                    <button className="btn btn-out" onClick={() => setPiqSyncAllModal(null)}>Cancel</button>
                    <button className="btn btn-blk" disabled={!piqSyncAllModal.templatePlanId} onClick={startSyncAllFromPiq}>
                      Start Sync
                    </button>
                  </div>
                </div>
              )}

              {/* ── Phase: syncing / done ── */}
              {(piqSyncAllModal.phase === "syncing" || piqSyncAllModal.phase === "done") && (
                <div>
                  {piqSyncAllModal.warning && (
                    <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:"6px", padding:"8px 12px", fontSize:"0.8rem", color:"#92400e", marginBottom:"12px" }}>
                      ⚠ {piqSyncAllModal.warning}
                    </div>
                  )}
                  {piqSyncAllModal.error && (
                    <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:"6px", padding:"10px 14px", fontSize:"0.82rem", color:"#dc2626", marginBottom:"12px" }}>
                      ✗ Discovery failed: {piqSyncAllModal.error}
                    </div>
                  )}
                  {(piqSyncAllModal.rows || []).length > 0 && (
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.82rem" }}>
                      <thead><tr style={{ borderBottom:"1px solid var(--border)" }}>
                        <th style={{ textAlign:"left", padding:"6px 8px", color:"var(--muted)" }}>Plan</th>
                        <th style={{ textAlign:"center", padding:"6px 8px", color:"var(--muted)" }}>OCs</th>
                        <th style={{ textAlign:"center", padding:"6px 8px", color:"var(--muted)" }}>Lots</th>
                        <th style={{ textAlign:"left", padding:"6px 8px", color:"var(--muted)" }}>Status</th>
                      </tr></thead>
                      <tbody>
                        {(piqSyncAllModal.rows || []).map(row => (
                          <tr key={row.planId} style={{ borderBottom:"1px solid var(--border2)" }}>
                            <td style={{ padding:"7px 8px" }}>
                              <strong style={{ fontFamily:"monospace", fontSize:"0.78rem" }}>{row.planId}</strong>
                              {row.isNew && <span style={{ marginLeft:"6px", fontSize:"0.68rem", background:"#dbeafe", color:"#1d4ed8", borderRadius:"3px", padding:"1px 5px" }}>New</span>}
                              <br/><span style={{ color:"var(--muted)", fontSize:"0.75rem" }}>{row.planName}</span>
                            </td>
                            <td style={{ textAlign:"center", padding:"7px 8px" }}>{row.status === "ok" ? row.ocs : "—"}</td>
                            <td style={{ textAlign:"center", padding:"7px 8px" }}>{row.status === "ok" ? row.lots : "—"}</td>
                            <td style={{ padding:"7px 8px" }}>
                              {row.status === "pending" && <span style={{ color:"var(--muted)" }}>Waiting…</span>}
                              {row.status === "running" && <span style={{ color:"#1a5fa8" }}>⟳ Syncing…</span>}
                              {row.status === "ok"      && <span style={{ color:"#16a34a", fontWeight:600 }}>✓ Done</span>}
                              {row.status === "err"     && <span style={{ color:"#dc2626", fontSize:"0.75rem" }} title={row.err}>✗ {row.err?.substring(0,60)}{row.err?.length > 60 ? "…" : ""}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {piqSyncAllModal.saveErr && (
                    <div style={{ color:"#dc2626", marginTop:"12px", fontSize:"0.8rem" }}>Save error: {piqSyncAllModal.saveErr}</div>
                  )}
                  {piqSyncAllModal.phase === "done" && !piqSyncAllModal.error && !piqSyncAllModal.saveErr && (
                    <div style={{ marginTop:"14px", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:"6px", padding:"10px 14px", fontSize:"0.82rem", color:"#16a34a", fontWeight:600 }}>
                      ✓ Sync complete. New plans are visible in the Plans tab — assign Plan IDs and verify products before going live.
                    </div>
                  )}
                  {piqSyncAllModal.phase === "done" && (
                    <div style={{ display:"flex", justifyContent:"flex-end", marginTop:"16px" }}>
                      <button className="btn btn-blk" onClick={() => setPiqSyncAllModal(null)}>Close</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev/OCOrder
node build.mjs 2>&1 | tail -5
```

Expected: build success.

- [ ] **Step 3: Commit**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev
git add OCOrder/src/App.jsx
git commit -m "feat: replace Sync All modal — phase select/syncing/done, New badge on stubs"
```

---

## Chunk 4: Build, Verify & Deploy

### Task 8: Final build, smoke test, merge to main, and deploy

**Files:**
- Build output: `OCOrder/dist/`
- Deploy target: Vercel production (`https://occorder.vercel.app`)

- [ ] **Step 1: Final clean build**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/compassionate-chebyshev/OCOrder
node build.mjs
```

Expected: `✅  Build complete → dist/` with no errors or warnings.

- [ ] **Step 2: Manual smoke test checklist (run locally if possible, otherwise after deploy)**

Open Admin → Plans tab. Verify:
1. Plans table column headers **Plan ID**, **Name**, **Lots**, **Products** are clickable — clicking cycles ▲ / ▼ / unsorted
2. Each row has a checkbox; "Select All" header checkbox selects/deselects all
3. Checking 1+ rows shows the red "Delete Selected (N)" button
4. Clicking "Delete" on a row shows `window.confirm()` with the correct message
5. Clicking "Sync All from PIQ" opens the **template selection** modal with a dropdown and a disabled "Start Sync" button
6. Selecting a template enables "Start Sync"
7. Clicking "Cancel" closes the modal without syncing

- [ ] **Step 3: Merge worktree branch to main**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
git checkout main
git merge --no-ff claude/compassionate-chebyshev -m "feat: PIQ sync-all discovers new buildings, Plans table sort + multi-delete"
```

- [ ] **Step 4: Push to git remote**

```bash
git push origin main
```

- [ ] **Step 5: Deploy to Vercel production**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod
```

Expected: deployment URL `https://occorder.vercel.app` — confirm the deployment completes without errors.

- [ ] **Step 6: Post-deploy smoke test on production**

Navigate to `https://occorder.vercel.app`, log in as admin, repeat the smoke test checklist from Step 2 on the live site. Pay special attention to:
- "Sync All from PIQ" → template selection → Start Sync → confirm discovery warning appears if applicable and new plan stubs appear in the table with "New" badges

---

## Summary of Files Changed

| File | Change |
|---|---|
| `api/_lib/piq.js` | Added `getAllPiqBuildings` export |
| `api/config/settings.js` | Added `list-piq-buildings` action; replaced `sync-piq` guard with mutual-exclusion + `piqBuildingId` branch |
| `OCOrder/src/App.jsx` | New state (`planSort`, `selectedPlanIds`); new `sortedPlans` memo; `confirmDeletePlans` replaces `deletePlan`; rewrote `syncAllFromPiq` + `startSyncAllFromPiq`; updated Plans table JSX; replaced Sync All modal JSX |
