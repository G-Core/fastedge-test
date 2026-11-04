import { describe, it, expect } from "vitest";
import { HostFunctions } from "../../../runner/HostFunctions";
import type { MemoryManager } from "../../../runner/MemoryManager";
import type { PropertyResolver } from "../../../runner/PropertyResolver";
import type { PropertyAccessControl } from "../../../runner/PropertyAccessControl";
import { MapType, ProxyStatus } from "../../../runner/types";
import { HookContext } from "../../../runner/PropertyAccessControl";

// Header host calls, driven directly. The stub memory resolves a "pointer"
// to the string at that index, so a key is passed as (index, length).
function setup(hook: HookContext | null = null) {
  const strings: string[] = [];
  const memory = {
    readString: (ptr: number) => strings[ptr],
    writeStringResult: () => {},
  } as unknown as MemoryManager;
  const host = new HostFunctions(
    memory,
    {} as PropertyResolver,
    {} as PropertyAccessControl,
    () => hook,
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

  it("http-call response headers are read-only", () => {
    const { host, imports, str } = setup();
    host.setHeadersAndBodies({ "x-req": "r" }, {}, "", "");
    host.setHttpCallResponse(1, { "x-up": "u" }, new Uint8Array());
    const map = MapType.HttpCallResponseHeaders;

    expect(imports.proxy_remove_header_map_value(map, ...str("x-up"))).toBe(ProxyStatus.Unimplemented);
    expect(imports.proxy_add_header_map_value(map, ...str("x-added"), ...str("a"))).toBe(ProxyStatus.Unimplemented);
    expect(imports.proxy_replace_header_map_value(map, ...str("x-up"), ...str("b"))).toBe(ProxyStatus.Unimplemented);
    expect(imports.proxy_set_header_map_pairs(map, 0, 0)).toBe(ProxyStatus.Unimplemented);

    expect(host.getRequestHeaders()).toEqual({ "x-req": "r" });
    const get = (k: string) => imports.proxy_get_header_map_value(map, ...str(k), 0, 0);
    expect(get("x-up")).toBe(ProxyStatus.Ok);
    expect(get("x-added")).toBe(ProxyStatus.NotFound);
  });

  // Edge-measured (preprod, 2026-11-04): trailer and gRPC maps are not served
  // in any phase, and an unknown map type is BadArgument.
  it.each([
    [MapType.RequestTrailers, ProxyStatus.Unimplemented],
    [MapType.ResponseTrailers, ProxyStatus.Unimplemented],
    [4, ProxyStatus.Unimplemented],
    [5, ProxyStatus.Unimplemented],
    [MapType.HttpCallResponseTrailers, ProxyStatus.Unimplemented],
    [8, ProxyStatus.BadArgument],
  ])("map %i returns %i for every header call and leaves the headers alone", (map, status) => {
    const { host, imports, str } = setup();
    host.setHeadersAndBodies({ "x-req": "r" }, { "x-res": "s" }, "", "");
    host.setHttpCallResponse(1, { "x-up": "u" }, new Uint8Array());

    expect(imports.proxy_get_header_map_value(map, ...str("x-req"), 0, 0)).toBe(status);
    expect(imports.proxy_get_header_map_pairs(map, 0, 0)).toBe(status);
    expect(imports.proxy_get_header_map_size(map, 0)).toBe(status);
    expect(imports.proxy_add_header_map_value(map, ...str("x-a"), ...str("a"))).toBe(status);
    expect(imports.proxy_replace_header_map_value(map, ...str("x-req"), ...str("b"))).toBe(status);
    expect(imports.proxy_remove_header_map_value(map, ...str("x-res"))).toBe(status);
    expect(imports.proxy_set_header_map_pairs(map, 0, 0)).toBe(status);

    expect(host.getRequestHeaders()).toEqual({ "x-req": "r" });
    expect(host.getResponseHeaders()).toEqual({ "x-res": "s" });
  });

  // Edge-measured (preprod, 2026-11-04): which header writes each hook accepts.
  const R = MapType.RequestHeaders;
  const S = MapType.ResponseHeaders;
  it.each([
    // hook, map, [add, replace, remove, set-all]
    [HookContext.OnRequestHeaders, R, [ProxyStatus.Ok, ProxyStatus.Ok, ProxyStatus.Ok, ProxyStatus.Ok]],
    [HookContext.OnRequestHeaders, S, [ProxyStatus.Ok, ProxyStatus.Ok, ProxyStatus.Ok, ProxyStatus.Ok]],
    [HookContext.OnResponseHeaders, R, [ProxyStatus.BadArgument, ProxyStatus.NotFound, ProxyStatus.BadArgument, ProxyStatus.BadArgument]],
    [HookContext.OnResponseHeaders, S, [ProxyStatus.Ok, ProxyStatus.Ok, ProxyStatus.Ok, ProxyStatus.Ok]],
    [HookContext.OnRequestBody, R, [ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound]],
    [HookContext.OnRequestBody, S, [ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound]],
    [HookContext.OnResponseBody, R, [ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound]],
    [HookContext.OnResponseBody, S, [ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound, ProxyStatus.NotFound]],
  ] as const)("%s map %i writes return %j", (hook, map, [add, replace, remove, setAll]) => {
    const { host, imports, str } = setup(hook);
    host.setHeadersAndBodies({ "x-req": "r" }, { "x-res": "s" }, "", "");
    const key = map === R ? "x-req" : "x-res";

    expect(imports.proxy_add_header_map_value(map, ...str("x-a"), ...str("a"))).toBe(add);
    expect(imports.proxy_replace_header_map_value(map, ...str(key), ...str("b"))).toBe(replace);
    expect(imports.proxy_remove_header_map_value(map, ...str(key))).toBe(remove);
    if (setAll !== ProxyStatus.Ok) {
      // set-all is only checked when rejected: the stub memory can't decode a map
      expect(imports.proxy_set_header_map_pairs(map, 0, 0)).toBe(setAll);
    }

    const headers = map === R ? host.getRequestHeaders() : host.getResponseHeaders();
    if (add === ProxyStatus.Ok) {
      expect(headers).toEqual({ "x-a": "a" });
    } else {
      expect(headers).toEqual(map === R ? { "x-req": "r" } : { "x-res": "s" });
    }
  });
});
