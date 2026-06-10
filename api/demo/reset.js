// POST /api/demo/reset — Reset demo data to seed state (demo mode only)
// Returns 403 in production so it is safe to deploy on the same codebase.
import { DEMO_MODE, DEMO_DEFAULT_DATA, DEMO_DEFAULT_CONFIG, replaceData, writeConfig, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!DEMO_MODE) return res.status(403).json({ error: "Not available in production." });

  // replaceData (not writeData) — writeData diff-merges with the live order
  // index and would preserve the orders this endpoint exists to wipe.
  await replaceData(structuredClone(DEMO_DEFAULT_DATA));
  await writeConfig(structuredClone(DEMO_DEFAULT_CONFIG));

  return res.status(200).json({ ok: true, message: "Demo data has been reset to the initial state." });
}
