// test/redis-helpers.js — Redis test client helpers
// Used by integration tests to flush, seed, and read test Redis state directly.
import { createClient } from "redis";

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

export async function seedConfig(cfg) {
  const client = await getClient();
  await client.set("tocs:config", JSON.stringify(cfg));
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
