// reset-admin.mjs — Emergency admin credential reset
// Run: node reset-admin.mjs
// Resets admin username and password back to defaults.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, "config.json");

const DEFAULT_USER = "info@tocs.co";
const DEFAULT_PASS = "Tocs@Vote";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

console.log("\n╔═══════════════════════════════════════╗");
console.log("║   TOCS Admin Credential Reset Tool   ║");
console.log("╚═══════════════════════════════════════╝\n");

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  console.log(`  Current username: ${cfg.admin?.user || "(unknown)"}`);
} catch {
  console.log("  No config.json found — will create one.");
}

const choice = await ask("\n  Options:\n  [1] Reset to defaults (info@tocs.co / Tocs@Vote)\n  [2] Set custom username and password\n  [q] Quit\n\n  Choice: ");

if (choice === "q" || choice === "Q") {
  console.log("\n  Cancelled.\n");
  process.exit(0);
}

let newUser = DEFAULT_USER;
let newPass = DEFAULT_PASS;

if (choice === "2") {
  newUser = await ask("\n  New username (email): ");
  if (!newUser.includes("@")) { console.error("\n  ❌  Invalid email address.\n"); process.exit(1); }
  newPass = await ask("  New password (min 8 chars): ");
  if (newPass.length < 8) { console.error("\n  ❌  Password must be at least 8 characters.\n"); process.exit(1); }
} else if (choice !== "1") {
  console.log("\n  Invalid choice. Exiting.\n");
  process.exit(1);
}

cfg.admin = { user: newUser, pass: newPass };
fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));

console.log(`\n  ✅  Admin credentials updated:`);
console.log(`      Username : ${newUser}`);
console.log(`      Password : ${"•".repeat(newPass.length)}`);
console.log(`\n  Restart the server (node server.js) and sign in with the new credentials.\n`);
