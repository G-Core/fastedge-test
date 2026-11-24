import { describe, it, expect } from "vitest";
import { createFastEdgeHostFunctions } from "../../../fastedge-host/hostFunctions";
import { SecretStore } from "../../../fastedge-host/SecretStore";
import { Dictionary } from "../../../fastedge-host/Dictionary";
import { ProxyStatus } from "../../../fastedge-host/types";
import type { MemoryManager } from "../../../runner/MemoryManager";

describe("FastEdge secret host functions", () => {
  const written: string[] = [];
  const memory = {
    readString: () => "API_KEY",
    writeStringResult: (value: string) => written.push(value),
  } as unknown as MemoryManager;
  const secrets = new SecretStore({ API_KEY: [{ value: "old", effectiveAt: 100 }, { value: "new", effectiveAt: 200 }] });
  const fns = createFastEdgeHostFunctions(memory, secrets, new Dictionary(), () => {});

  // The FastEdge Rust SDK imports the proxy_secret_* names; an app missing one fails to instantiate.
  it("registers every name the edge does, the aliases behaving the same", () => {
    expect(fns.proxy_secret_get(0, 7, 0, 0)).toBe(ProxyStatus.Ok);
    expect(fns.proxy_secret_get_effective_at(0, 7, 150, 0, 0)).toBe(ProxyStatus.Ok);
    expect(fns.proxy_get_effective_at_secret(0, 7, 250, 0, 0)).toBe(ProxyStatus.Ok);
    expect(fns.proxy_secret_get_effective_at(0, 7, 50, 0, 0)).toBe(ProxyStatus.NotFound);
    expect(written).toEqual(["new", "old", "new"]);
  });

  // `at` is a u32 on the edge: 2^31 and above arrive in JavaScript as negative i32s.
  it("reads `at` as unsigned", () => {
    written.length = 0;
    expect(fns.proxy_secret_get_effective_at(0, 7, -2147483648, 0, 0)).toBe(ProxyStatus.Ok);
    expect(written).toEqual(["new"]);
  });

  // The edge returns an empty value as a value (0 bytes); only a missing name is NotFound.
  it("an empty value is Ok, plain or in a slot", () => {
    const empty = new SecretStore({ API_KEY: "" });
    const slotted = new SecretStore({ API_KEY: [{ value: "", effectiveAt: 0 }, { value: "x", effectiveAt: 4000000000 }] });
    for (const store of [empty, slotted]) {
      const f = createFastEdgeHostFunctions(memory, store, new Dictionary(), () => {});
      expect(f.proxy_get_secret(0, 7, 0, 0)).toBe(ProxyStatus.Ok);
      expect(f.proxy_get_effective_at_secret(0, 7, 0, 0, 0)).toBe(ProxyStatus.Ok);
    }
    expect(createFastEdgeHostFunctions(memory, new SecretStore(), new Dictionary(), () => {}).proxy_get_secret(0, 7, 0, 0)).toBe(ProxyStatus.NotFound);
  });
});
