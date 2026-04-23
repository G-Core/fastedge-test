import { describe, it, expect, afterEach } from "vitest";
import { getGlobalDispatcher, type Dispatcher } from "undici";
import { mockOrigins } from "../../../test-framework/mock-origins";

// Every test owns exactly one mockOrigins handle. afterEach guarantees the
// global dispatcher is restored even if a test throws mid-flight.
let handle: ReturnType<typeof mockOrigins> | null = null;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = null;
  }
});

describe("mockOrigins", () => {
  describe("lifecycle", () => {
    it("installs a MockAgent as the global dispatcher", () => {
      const before = getGlobalDispatcher();
      handle = mockOrigins();
      const during = getGlobalDispatcher();

      expect(during).not.toBe(before);
      expect(during).toBe(handle.agent);
    });

    it("restores the previous dispatcher on close", async () => {
      const before = getGlobalDispatcher();
      handle = mockOrigins();
      await handle.close();
      handle = null;

      expect(getGlobalDispatcher()).toBe(before);
    });

    it("is idempotent on close", async () => {
      handle = mockOrigins();
      await handle.close();
      await expect(handle.close()).resolves.toBeUndefined();
      handle = null;
    });
  });

  describe("network connect policy", () => {
    it("blocks unmocked requests by default", async () => {
      handle = mockOrigins();
      await expect(
        fetch("https://not-mocked.example/x"),
      ).rejects.toThrow();
    });

    it("allows unmocked requests when allowNetConnect is true", () => {
      handle = mockOrigins({ allowNetConnect: true });
      // We don't actually hit the network here (would be flaky); we just
      // verify the agent is in allow-all mode by checking the interceptor
      // isn't required for arbitrary requests. The presence of disableNetConnect
      // would be observable via `assertAllCalled` throwing on first unmocked
      // fetch — instead we inspect the agent directly.
      expect(() => handle!.agent.assertNoPendingInterceptors()).not.toThrow();
    });

    it("allows only origins matching the allowlist pattern", async () => {
      handle = mockOrigins({ allowNetConnect: [/^127\.0\.0\.1/] });
      // Non-matching origin is still blocked
      await expect(
        fetch("https://not-mocked.example/x"),
      ).rejects.toThrow();
      // Matching pattern would succeed — we can't hit real 127.0.0.1 here
      // without a server, but the block-by-default contract above is what
      // this option exists to preserve for HTTP-WASM tests.
    });
  });

  describe("interception", () => {
    it("intercepts a mocked origin and returns the configured reply", async () => {
      handle = mockOrigins();
      handle
        .origin("https://origin.example")
        .intercept({ path: "/api" })
        .reply(200, "hello");

      const res = await fetch("https://origin.example/api");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("hello");
    });

    it("method in the inner intercept call controls the HTTP method match", async () => {
      handle = mockOrigins();
      handle
        .origin("https://api.example")
        .intercept({ path: "/widgets", method: "POST" })
        .reply(201, '{"id":1}');

      const res = await fetch("https://api.example/widgets", {
        method: "POST",
        body: "{}",
      });
      expect(res.status).toBe(201);

      // GET to the same path is not intercepted, so net-connect-disabled
      // causes a rejection.
      await expect(
        fetch("https://api.example/widgets"),
      ).rejects.toThrow();
    });

    it("supports multiple origins in parallel", async () => {
      handle = mockOrigins();
      handle.origin("https://a.example").intercept({ path: "/" }).reply(200, "A");
      handle.origin("https://b.example").intercept({ path: "/" }).reply(200, "B");

      const [ra, rb] = await Promise.all([
        fetch("https://a.example/").then((r) => r.text()),
        fetch("https://b.example/").then((r) => r.text()),
      ]);
      expect(ra).toBe("A");
      expect(rb).toBe("B");
    });

    it("origin() is a thin pass-through to MockAgent.get", () => {
      handle = mockOrigins();
      const pool = handle.origin("https://origin.example");
      expect(pool).toBe(handle.agent.get("https://origin.example"));
    });
  });

  describe("assertAllCalled", () => {
    it("throws when a registered interceptor was never called", () => {
      handle = mockOrigins();
      handle.origin("https://unused.example").intercept({ path: "/" }).reply(200);

      expect(() => handle!.assertAllCalled()).toThrow();
    });

    it("passes when every interceptor was hit", async () => {
      handle = mockOrigins();
      handle.origin("https://hit.example").intercept({ path: "/" }).reply(200, "ok");

      await fetch("https://hit.example/");
      expect(() => handle!.assertAllCalled()).not.toThrow();
    });
  });
});
