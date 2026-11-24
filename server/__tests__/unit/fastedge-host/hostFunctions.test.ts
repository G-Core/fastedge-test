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
});
