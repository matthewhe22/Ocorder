// scripts/fix-oc-allocation.mjs
// ─────────────────────────────────────────────────────────────────────────────
// One-time data repair: re-point lots that were wrongly assigned to placeholder
// Owner Corporations (e.g. OC-1, OC-2 minted by a spreadsheet lot import) back
// onto the canonical PropertyIQ Owner Corporations on the same building
// (e.g. OC-159, OC-160), then delete the now-empty placeholder OCs.
//
// WHY THIS EXISTS
//   When a building is imported from PropertyIQ, its Owner Corporations are
//   created as `OC-<piqScheduleId>` (e.g. OC-159, OC-160). The legacy
//   spreadsheet "Lot — OC allocation" import minted NEW ids by sheet position
//   (OC-1, OC-2, …) and assigned every lot to them, leaving the building with
//   duplicate OCs and every lot pointing at the wrong pair.
//
// HOW IT DECIDES THE MAPPING (no guessing)
//   - "Canonical" OCs are those carrying a `piqScheduleId` (came from PIQ).
//   - "Placeholder" OCs are those WITHOUT a `piqScheduleId`.
//   - Each placeholder is matched to a canonical OC by NAME (case-insensitive,
//     trimmed). e.g. placeholder OC-1 "Owners Corporation 1" → canonical
//     OC-159 "Owners Corporation 1".
//   If a placeholder's name can't be matched to exactly one canonical OC, the
//   script aborts and changes nothing (so it never makes a wrong reassignment).
//
// SAFETY
//   - DRY RUN by default. It prints exactly what it would change and writes
//     nothing. Pass --commit to persist.
//   - Idempotent: re-running after a successful commit is a no-op.
//   - Targets ONE building (default plan id PS721509P — "Latrobe Tower",
//     323 La Trobe Street). Override with --plan=<id|nameOrAddressSubstring>.
//
// USAGE
//   Dry run (recommended first):
//     REDIS_URL='rediss://…' node scripts/fix-oc-allocation.mjs
//   Apply:
//     REDIS_URL='rediss://…' node scripts/fix-oc-allocation.mjs --commit
//   Different building:
//     REDIS_URL='rediss://…' node scripts/fix-oc-allocation.mjs --plan="La Trobe"
//
//   (Use the same REDIS_URL that the production Vercel deployment uses. For a
//    demo store, also set DEMO_MODE=true.)
// ─────────────────────────────────────────────────────────────────────────────

import { readData, writeData, KV_AVAILABLE } from "../api/_lib/store.js";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const planArg = (args.find(a => a.startsWith("--plan=")) || "--plan=PS721509P").slice("--plan=".length);

const norm = s => String(s || "").trim().toLowerCase();

function findPlan(plans, sel) {
  // Exact id first, then substring match on id / name / address.
  let p = plans.find(p => p.id === sel);
  if (p) return p;
  const n = norm(sel);
  const matches = plans.filter(p =>
    norm(p.id).includes(n) || norm(p.name).includes(n) || norm(p.address).includes(n));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1)
    throw new Error(`"${sel}" matched ${matches.length} buildings: ${matches.map(m => `${m.id} (${m.name})`).join(", ")}. Re-run with an exact --plan=<id>.`);
  return null;
}

function buildMapping(plan) {
  const ocs = plan.ownerCorps || {};
  const entries = Object.entries(ocs);
  const canonical   = entries.filter(([, oc]) => oc && oc.piqScheduleId != null);
  const placeholder = entries.filter(([, oc]) => !oc || oc.piqScheduleId == null);

  if (canonical.length === 0)
    throw new Error(`Building ${plan.id} has no PropertyIQ-linked OCs (none carry piqScheduleId). Nothing to map onto — aborting.`);
  if (placeholder.length === 0)
    return { map: {}, canonical, placeholder }; // already clean

  // Index canonical OCs by normalised name (must be unique to match safely).
  const canonByName = new Map();
  for (const [id, oc] of canonical) {
    const key = norm(oc.name);
    if (canonByName.has(key))
      throw new Error(`Two PIQ OCs share the name "${oc.name}" on ${plan.id}; can't map by name safely. Aborting.`);
    canonByName.set(key, id);
  }

  const map = {};
  const unmatched = [];
  for (const [id, oc] of placeholder) {
    const target = canonByName.get(norm(oc?.name));
    if (!target) unmatched.push(`${id} ("${oc?.name ?? ""}")`);
    else map[id] = target;
  }
  if (unmatched.length)
    throw new Error(`Could not match these placeholder OCs to a PIQ OC by name: ${unmatched.join(", ")}. Aborting — no changes made.`);
  return { map, canonical, placeholder };
}

async function main() {
  if (!KV_AVAILABLE) {
    console.error("No REDIS_URL/KV_URL is set. Point this at your store, e.g.:\n  REDIS_URL='rediss://…' node scripts/fix-oc-allocation.mjs");
    process.exit(1);
  }

  const data = await readData();
  const plan = findPlan(data.strataPlans || [], planArg);
  if (!plan) {
    console.error(`No building matched --plan="${planArg}".`);
    console.error("Available:", (data.strataPlans || []).map(p => `${p.id} (${p.name})`).join(", "));
    process.exit(1);
  }

  console.log(`\nBuilding: ${plan.id} — ${plan.name} (${plan.address || "no address"})`);
  console.log("Owner Corporations currently on this building:");
  for (const [id, oc] of Object.entries(plan.ownerCorps || {}))
    console.log(`  ${id.padEnd(8)} ${oc?.piqScheduleId != null ? "[PIQ]" : "[placeholder]"}  ${oc?.name ?? ""}`);

  const { map } = buildMapping(plan);
  const placeholderIds = Object.keys(map);

  if (placeholderIds.length === 0) {
    console.log("\nNothing to fix — this building has no placeholder OCs. ✅");
    return;
  }

  console.log("\nPlanned re-mapping (placeholder → canonical PIQ OC):");
  for (const [from, to] of Object.entries(map))
    console.log(`  ${from}  →  ${to}   (${plan.ownerCorps[to].name})`);

  // Re-point every lot, de-duplicating the resulting OC list.
  let lotsChanged = 0;
  for (const lot of (plan.lots || [])) {
    const before = Array.isArray(lot.ownerCorps) ? lot.ownerCorps : [];
    const after = [...new Set(before.map(oc => map[oc] || oc))];
    if (before.length !== after.length || before.some((v, i) => v !== after[i])) {
      lot.ownerCorps = after;
      lotsChanged++;
    }
  }

  // Drop the now-orphaned placeholder OCs.
  for (const id of placeholderIds) delete plan.ownerCorps[id];

  console.log(`\n${lotsChanged} lot(s) re-pointed; ${placeholderIds.length} placeholder OC(s) removed.`);
  console.log("Owner Corporations after fix:");
  for (const [id, oc] of Object.entries(plan.ownerCorps))
    console.log(`  ${id.padEnd(8)} ${oc?.name ?? ""}`);

  if (!COMMIT) {
    console.log("\nDRY RUN — nothing written. Re-run with --commit to apply.");
    return;
  }

  await writeData(data);
  console.log("\n✅ Committed. The building now has only its PropertyIQ Owner Corporations.");
}

main().then(() => process.exit(0)).catch(err => {
  console.error("\n❌", err.message);
  process.exit(1);
});
