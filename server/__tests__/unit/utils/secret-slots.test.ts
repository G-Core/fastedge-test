import { describe, it, expect } from "vitest";
import { secretSlots, SecretSlotError } from "../../../utils/dotenv-loader.js";
import { SecretStore } from "../../../fastedge-host/SecretStore.js";

// The same rules as fastedge-run's `--secret NAME@SLOT=value`, so CDN and HTTP apps read one format.
describe("secretSlots", () => {
  it("a bare name is a plain value (slot 0, effective at every time)", () => {
    expect(secretSlots({ TOKEN: "only" })).toEqual({ TOKEN: "only" });
  });

  it("NAME@SLOT adds slots; the store returns the highest slot not above `at`", () => {
    const store = new SecretStore(secretSlots({ TOKEN: "original", "TOKEN@5": "updated" }));
    expect(store.getEffectiveAt("TOKEN", 4)).toBe("original");
    expect(store.getEffectiveAt("TOKEN", 5)).toBe("updated");
    expect(store.get("TOKEN")).toBe("updated");
    expect(new SecretStore(secretSlots({ "TOKEN@5": "updated" })).getEffectiveAt("TOKEN", 3)).toBeNull();
  });

  it("any secret name works, including Object.prototype ones", () => {
    const store = new SecretStore(secretSlots({ constructor: "a", "constructor@5": "b", toString: "c" }));
    expect(store.getEffectiveAt("constructor", 5)).toBe("b");
    expect(store.get("toString")).toBe("c");
  });

  it("each slot has one spelling; anything else is an error", () => {
    for (const key of ["TOKEN@abc", "TOKEN@-1", "TOKEN@", "@5", "TOKEN@0", "TOKEN@05", "TOKEN@+5", "TOKEN@18446744073709551616"]) {
      expect(() => secretSlots({ [key]: "v" }), key).toThrow(SecretSlotError);
    }
    expect(() => secretSlots({ "TOKEN@18446744073709551615": "v" })).not.toThrow();
  });
});
