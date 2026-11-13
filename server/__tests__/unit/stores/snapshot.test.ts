import { describe, it, expect } from "vitest";
import { createStores } from "../../../stores/testStores";

async function admin(stores: { url: string; token: string }, body: object) {
  const res = await fetch(`${stores.url}/v1/admin`, {
    method: "POST",
    headers: { authorization: `Bearer ${stores.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; value: any };
}

describe("stores snapshot and reset", () => {
  it("lists live cache entries of one dc, every dc, and KV keys by type", async () => {
    const stores = await createStores({ fixtures: false });
    try {
      stores.seed({ kv: { users: { strings: { a: "hello" }, zsets: { z: [["m1", 1], ["m2", 2]] }, bloom: { b: ["x"] } } } });
      stores.cache.set("k1", "abc", { ttlMs: 1000 });
      stores.cache.set("k2", "x", { ttlMs: 1000, dc: "fr5" });
      stores.cache.set("gone", "x", { ttlMs: 10 });
      stores.advanceClock(20);

      const { value } = await admin(stores, { op: "snapshot", dc: "local" });
      expect(value.dcs).toEqual(["fr5", "local"]);
      expect(value.cache).toEqual([{ key: "k1", size: 3, expiresAt: expect.any(Number) }]);
      expect(value.cache[0].expiresAt - value.now).toBeLessThanOrEqual(980);
      expect(value.kv).toEqual([
        { store: "users", strings: [{ key: "a", size: 5 }], zsets: [{ key: "z", members: 2 }], bloom: [{ key: "b", items: 1 }] },
      ]);

      expect((await admin(stores, { op: "reset" })).ok).toBe(true);
      const after = (await admin(stores, { op: "snapshot" })).value;
      expect(after.cache).toEqual([]);
      expect(after.dcs).toEqual([]);
      expect(after.kv).toEqual([]); // no fixtures: the seeded store is gone
    } finally {
      await stores.close();
    }
  });
});
