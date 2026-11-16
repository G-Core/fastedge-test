import { describe, it, expect } from "vitest";
import { createStores } from "../../../stores/testStores";
import { kvFixtureText, kvSeed } from "../../../stores/fixtures";

async function admin(stores: { url: string; token: string }, body: object) {
  const res = await fetch(`${stores.url}/v1/admin`, {
    method: "POST",
    headers: { authorization: `Bearer ${stores.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, ...((await res.json()) as { ok: boolean; value: any }) };
}

describe("Storage Explorer admin ops", () => {
  it("puts (replacing any type), deletes and exports KV keys; creates and deletes stores", async () => {
    const stores = await createStores({ fixtures: false });
    try {
      await admin(stores, { op: "kv-put", store: "users", key: "a", data: { strings: { a: "hello" } } });
      await admin(stores, { op: "kv-put", store: "users", key: "z", data: { zsets: { z: [["m2", 2], ["m1", 1]] } } });
      await admin(stores, { op: "kv-put", store: "users", key: "bin", data: { strings: { bin: { base64: "/w==" } } } });
      // A key changes type: the old value goes.
      await admin(stores, { op: "kv-put", store: "users", key: "a", data: { bloom: { a: ["x"] } } });
      await admin(stores, { op: "kv-store-create", store: "empty" });

      const exported = (await admin(stores, { op: "kv-export" })).value;
      expect(JSON.parse(exported.users)).toEqual({
        strings: { bin: { base64: "/w==" } },
        zsets: { z: [["m1", 1], ["m2", 2]] },
        bloom: { a: ["x"] },
      });
      expect(exported.empty).toBe("{}\n");
      expect((await admin(stores, { op: "kv", store: "users", key: "a" })).status).toBe(400); // not an op

      await admin(stores, { op: "kv-delete", store: "users", key: "z" });
      await admin(stores, { op: "kv-store-delete", store: "empty" });
      const after = (await admin(stores, { op: "kv-export" })).value;
      expect(Object.keys(after)).toEqual(["users"]);
      expect(JSON.parse(after.users).zsets).toBeUndefined();

      // Invalid data is a bad request (an empty KV value is refused on the edge).
      expect((await admin(stores, { op: "kv-put", store: "users", key: "e", data: { strings: { e: "" } } })).status).toBe(400);
    } finally {
      await stores.close();
    }
  });

  it("writes fixture text that parses back to the same data", () => {
    const seed = kvSeed({ strings: { b: "two", a: { base64: "AAE=" } }, zsets: { z: [["m", 1.5]] }, bloom: { f: ["i"] } }, "t");
    const text = kvFixtureText(seed);
    expect(Object.keys(JSON.parse(text).strings)).toEqual(["a", "b"]);
    expect(kvSeed(JSON.parse(text), "t")).toEqual(seed);
  });
});
