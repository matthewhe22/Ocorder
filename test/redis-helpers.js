// test/redis-helpers.js
// Provides helpers for integration tests to interact with the test Redis instance
// directly — bypassing the app's store module to ensure isolation.
//
// Call flushTestDb() in beforeEach to guarantee a clean slate between tests.

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
