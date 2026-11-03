import { describe, it, expect } from "vitest";
import { HostFunctions } from "../../../runner/HostFunctions";
import type { MemoryManager } from "../../../runner/MemoryManager";
import type { PropertyResolver } from "../../../runner/PropertyResolver";
import type { PropertyAccessControl } from "../../../runner/PropertyAccessControl";
import { MapType, ProxyStatus } from "../../../runner/types";

// Header host calls, driven directly. The stub memory resolves a "pointer"
// to the string at that index, so a key is passed as (index, length).
function setup() {
  const strings: string[] = [];
  const memory = {
    readString: (ptr: number) => strings[ptr],
    writeStringResult: () => {},
  } as unknown as MemoryManager;
  const host = new HostFunctions(
    memory,
    {} as PropertyResolver,
    {} as PropertyAccessControl,
    () => null,
  );
  const imports = host.createImports() as Record<string, (...a: number[]) => number>;
  const str = (s: string): [number, number] => [strings.push(s) - 1, s.length];
  return { host, imports, str };
}

describe("HostFunctions header maps", () => {
  it("get returns NotFound for a missing header and for an empty value", () => {
    const { host, imports, str } = setup();
    host.setHeadersAndBodies({ "x-empty": "", "x-set": "v" }, {}, "", "");
    const get = (k: string) => imports.proxy_get_header_map_value(MapType.RequestHeaders, ...str(k), 0, 0);
    expect(get("x-missing")).toBe(ProxyStatus.NotFound);
    expect(get("x-empty")).toBe(ProxyStatus.NotFound);
    expect(get("x-set")).toBe(ProxyStatus.Ok);
  });

  it("remove deletes every entry for the key", () => {
    const { host, imports, str } = setup();
    host.setHeadersAndBodies({ "x-keep": "k", "set-cookie": ["a", "b"] }, {}, "", "");
    imports.proxy_remove_header_map_value(MapType.RequestHeaders, ...str("set-cookie"));
    expect(host.getRequestHeaders()).toEqual({ "x-keep": "k" });
  });

  it("http-call response header writes stay in the http-call map", () => {
    const { host, imports, str } = setup();
    host.setHeadersAndBodies({ "x-req": "r" }, {}, "", "");
    host.setHttpCallResponse(1, { "x-up": "u", "x-gone": "g" }, new Uint8Array());

    imports.proxy_remove_header_map_value(MapType.HttpCallResponseHeaders, ...str("x-gone"));
    imports.proxy_add_header_map_value(MapType.HttpCallResponseHeaders, ...str("x-added"), ...str("a"));
    imports.proxy_remove_header_map_value(MapType.HttpCallResponseHeaders, ...str("x-absent"));

    expect(host.getRequestHeaders()).toEqual({ "x-req": "r" });
    const get = (k: string) => imports.proxy_get_header_map_value(MapType.HttpCallResponseHeaders, ...str(k), 0, 0);
    expect(get("x-gone")).toBe(ProxyStatus.NotFound);
    expect(get("x-up")).toBe(ProxyStatus.Ok);
    expect(get("x-added")).toBe(ProxyStatus.Ok);
  });
});
