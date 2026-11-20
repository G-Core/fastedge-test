import { describe, it, expect } from "vitest";
import { matchRule } from "../../../runner/resource";
import type { ResourceConfig } from "../../../schemas/config";

const config = (...match: string[]) => ({ rules: match.map((m, i) => ({ name: `r${i}`, match: m })) }) as unknown as ResourceConfig;

describe("resource rules", () => {
  it("picks the first rule whose pattern matches the path", () => {
    expect(matchRule(config("^/api/", "^/"), "https://x.example/api/v1?q=1")).toEqual({ index: 0, name: "r0", match: "^/api/" });
    expect(matchRule(config("^/api/"), "https://x.example/other")).toBeNull();
  });

  it("fails a pattern that backtracks too long instead of hanging the server", () => {
    const started = Date.now();
    expect(() => matchRule(config("^/(a+)+$"), `https://x.example/${"a".repeat(40)}!`)).toThrow(/took over 100 ms/);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
