// test/redis-helpers.js — Redis test client helpers
// Used by integration tests to flush, seed, and read test Redis state directly.
import { createClient } from "redis";
import { createHmac } from "crypto";

let _client = null;

async function getClient() {
  if (!_client) {
    _client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: false, // Do not retry — fail fast for test detection
      },
    });
    _client.on("error", (err) => console.error("Test Redis error:", err.message));
    await _client.connect();
  }
  return _client;
}

export async function flushTestDb() {
  const client = await getClient();
  await client.flushDb();
}

export async function seedData(data) {
  const client = await getClient();
  await client.set("tocs:data", JSON.stringify(data));
}

export async function seedConfig(cfg = {}) {
  const client = await getClient();
  await client.set("tocs:config", JSON.stringify(cfg));
}

/** Generate a valid HMAC-signed session token using the test TOKEN_SECRET. */
export async function createTestToken(user = "testadmin@example.com") {
  const exp = Date.now() + 8 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ user, exp })).toString("base64url");
  const secret = process.env.TOKEN_SECRET || process.env.ADMIN_PASS;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export async function getStored(key) {
  const client = await getClient();
  const raw = await client.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function closeTestDb() {
  if (_client) {
    try {
      await _client.quit();
    } catch {
      // ignore errors on close
    }
    _client = null;
  }
}
