import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startTestServer, authedFetch, type TestServer } from "./helpers.js";

describe("debugger server — Storage Explorer", () => {
  let server: TestServer;
  const call = async (route: string, body?: unknown) => {
    const res = await authedFetch(server.base, server.token, route, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await call("/api/storage/reset", {});
    await server.close();
  });

  it("edits Edge KV and the cache with no app loaded", async () => {
    expect((await call("/api/storage/kv/put", { store: "users", key: "alice", type: "string", value: '{"role":"admin"}' })).status).toBe(200);
    await call("/api/storage/kv/put", { store: "users", key: "rank", type: "zset", members: [["alice", 1]] });
    await call("/api/storage/cache/put", { dc: "fr5", key: "page", value: "hi", ttlMs: 60000 });

    const snapshot = (await call("/api/storage?dc=fr5")).body;
    expect(snapshot.kv).toEqual([{ store: "users", strings: [{ key: "alice", size: 16 }], zsets: [{ key: "rank", members: 1 }], bloom: [] }]);
    expect(snapshot.cache.map((e: { key: string }) => e.key)).toEqual(["page"]);

    const value = (await call("/api/storage/value?store=users&key=alice")).body.value;
    expect(Buffer.from(value.value, "base64").toString()).toBe('{"role":"admin"}');
  });

  it("changes a cache entry's TTL and keeps its value", async () => {
    const before = (await call("/api/storage?dc=fr5")).body;
    const expire = await call("/api/storage/cache/expire", { dc: "fr5", key: "page", ttlMs: 3_600_000 });
    expect(expire.body.updated).toBe(true);
    const after = (await call("/api/storage?dc=fr5")).body;
    expect(after.cache[0].expiresAt - after.now).toBeGreaterThan(before.cache[0].expiresAt - before.now);
    const value = (await call("/api/storage/value?dc=fr5&key=page")).body.value;
    expect(Buffer.from(value.value, "base64").toString()).toBe("hi");
    expect((await call("/api/storage/cache/expire", { dc: "fr5", key: "missing", ttlMs: 1000 })).body.updated).toBe(false);
  });

  it("imports plain JSON and refuses what the edge refuses", async () => {
    const imported = await call("/api/storage/import", { store: "flags", data: { beta: true, name: "x" } });
    expect(imported.body.keys).toBe(2);
    const value = (await call("/api/storage/value?store=flags&key=beta")).body.value;
    expect(Buffer.from(value.value, "base64").toString()).toBe("true");

    const empty = await call("/api/storage/kv/put", { store: "users", key: "e", type: "string", value: "" });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain("cannot be empty");
    expect((await call("/api/storage/kv/put", { store: "../x", key: "k", type: "string", value: "v" })).status).toBe(400);
  });

  it("saves to fixtures only what the diff showed", async () => {
    const diff = (await call("/api/storage/fixtures/diff")).body;
    expect(diff.changes.map((c: { file: string; status: string }) => [c.file, c.status])).toEqual([
      ["fixtures/stores/kv/flags.json", "new"],
      ["fixtures/stores/kv/users.json", "new"],
    ]);

    // A change after the diff: saving the stale diff is refused.
    await call("/api/storage/kv/put", { store: "users", key: "bob", type: "string", value: "b" });
    const stale = await call("/api/storage/fixtures/save", { files: [{ file: diff.changes[1].file, hash: diff.changes[1].hash }] });
    expect(stale.status).toBe(409);

    const fresh = (await call("/api/storage/fixtures/diff")).body.changes;
    const users = fresh.find((c: { store: string }) => c.store === "users");
    expect((await call("/api/storage/fixtures/save", { files: [{ file: users.file, hash: users.hash }] })).status).toBe(200);
    const written = JSON.parse(readFileSync(join(server.workspacePath, users.file), "utf8"));
    expect(written.strings).toEqual({ alice: '{"role":"admin"}', bob: "b" });
    expect(existsSync(join(server.workspacePath, "fixtures/stores/kv/flags.json"))).toBe(false);

    // Saved files no longer differ.
    const after = (await call("/api/storage/fixtures/diff")).body.changes.map((c: { store: string }) => c.store);
    expect(after).toEqual(["flags"]);
  });

  it("does not save through a symlink", async () => {
    await call("/api/storage/kv/put", { store: "linked", key: "k", type: "string", value: "v" });
    const outside = join(server.workspacePath, "outside.json");
    writeFileSync(outside, "keep");
    mkdirSync(join(server.workspacePath, "fixtures/stores/kv"), { recursive: true });
    symlinkSync(outside, join(server.workspacePath, "fixtures/stores/kv/linked.json"));
    const change = (await call("/api/storage/fixtures/diff")).body.changes.find((c: { store: string }) => c.store === "linked");
    const save = await call("/api/storage/fixtures/save", { files: [{ file: change.file, hash: change.hash }] });
    expect(save.status).toBe(400);
    expect(readFileSync(outside, "utf8")).toBe("keep");
    rmSync(join(server.workspacePath, "fixtures/stores/kv/linked.json"));

    // A dangling link is refused too.
    symlinkSync(join(server.workspacePath, "nowhere.json"), join(server.workspacePath, "fixtures/stores/kv/linked.json"));
    const again = (await call("/api/storage/fixtures/diff")).body.changes.find((c: { store: string }) => c.store === "linked");
    expect((await call("/api/storage/fixtures/save", { files: [{ file: again.file, hash: again.hash }] })).status).toBe(400);
    expect(existsSync(join(server.workspacePath, "nowhere.json"))).toBe(false);
    rmSync(join(server.workspacePath, "fixtures/stores/kv/linked.json"));
  });
});
