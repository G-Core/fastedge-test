import { describe, it, expect } from "vitest";
import { parseFetchHeaders } from "../../../runner/HttpWasmRunner";
import {
  assertHttpHeader,
  assertHttpNoHeader,
} from "../../../test-framework/assertions";
import type { HttpResponse } from "../../../runner/IWasmRunner";

// Regression coverage for the Set-Cookie bug where duplicate Set-Cookie
// headers collapsed to last-wins via Headers.forEach (RFC 6265 §3 exempts
// Set-Cookie from the comma-combine rule).

function makeHttpResponse(headers: Headers): HttpResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: parseFetchHeaders(headers),
    body: "",
    contentType: headers.get("content-type"),
    isBase64: false,
    logs: [],
  };
}

describe("parseFetchHeaders", () => {
  it("preserves multiple Set-Cookie values as string[]", () => {
    const h = new Headers();
    h.append("Set-Cookie", "sid=abc; Path=/; HttpOnly");
    h.append("Set-Cookie", "theme=dark; Path=/");
    h.append("Content-Type", "text/plain");

    const result = parseFetchHeaders(h);

    expect(result["set-cookie"]).toEqual([
      "sid=abc; Path=/; HttpOnly",
      "theme=dark; Path=/",
    ]);
    expect(result["content-type"]).toBe("text/plain");
  });

  it("keeps a single Set-Cookie as string[] of length 1", () => {
    const h = new Headers();
    h.append("Set-Cookie", "only=one; Path=/");

    const result = parseFetchHeaders(h);

    expect(result["set-cookie"]).toEqual(["only=one; Path=/"]);
  });

  it("omits set-cookie entirely when the response has none", () => {
    const h = new Headers();
    h.append("Content-Type", "application/json");

    const result = parseFetchHeaders(h);

    expect(result).not.toHaveProperty("set-cookie");
    expect(result["content-type"]).toBe("application/json");
  });

  it("returns all other headers as single strings", () => {
    const h = new Headers();
    h.append("Content-Type", "text/html");
    h.append("Location", "/next");
    h.append("X-Custom", "value");

    const result = parseFetchHeaders(h);

    expect(result["content-type"]).toBe("text/html");
    expect(result["location"]).toBe("/next");
    expect(result["x-custom"]).toBe("value");
  });
});

describe("assertHttpHeader with multi-valued set-cookie", () => {
  it("matches any cookie via .includes() semantics when expected is a string", () => {
    const h = new Headers();
    h.append("Set-Cookie", "sid=abc; Path=/");
    h.append("Set-Cookie", "theme=dark; Path=/");
    const response = makeHttpResponse(h);

    expect(() =>
      assertHttpHeader(response, "set-cookie", "sid=abc; Path=/"),
    ).not.toThrow();
    expect(() =>
      assertHttpHeader(response, "set-cookie", "theme=dark; Path=/"),
    ).not.toThrow();
  });

  it("throws when the expected cookie is not present", () => {
    const h = new Headers();
    h.append("Set-Cookie", "sid=abc; Path=/");
    const response = makeHttpResponse(h);

    expect(() =>
      assertHttpHeader(response, "set-cookie", "missing=x"),
    ).toThrow(/set-cookie/i);
  });

  it("matches exact array when expected is string[]", () => {
    const h = new Headers();
    h.append("Set-Cookie", "a=1");
    h.append("Set-Cookie", "b=2");
    const response = makeHttpResponse(h);

    expect(() =>
      assertHttpHeader(response, "set-cookie", ["a=1", "b=2"]),
    ).not.toThrow();
    expect(() =>
      assertHttpHeader(response, "set-cookie", ["b=2", "a=1"]),
    ).toThrow();
  });

  it("is case-insensitive on header name lookup", () => {
    const h = new Headers();
    h.append("Set-Cookie", "sid=abc");
    const response = makeHttpResponse(h);

    expect(() =>
      assertHttpHeader(response, "Set-Cookie", "sid=abc"),
    ).not.toThrow();
    expect(() =>
      assertHttpHeader(response, "SET-COOKIE", "sid=abc"),
    ).not.toThrow();
  });

  it("assertHttpNoHeader still works with Set-Cookie absent", () => {
    const h = new Headers();
    h.append("Content-Type", "text/plain");
    const response = makeHttpResponse(h);

    expect(() => assertHttpNoHeader(response, "set-cookie")).not.toThrow();
  });
});
