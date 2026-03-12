import { describe, it, expect } from "vitest";
import { computeJsonDiff, isPlainObject, type DiffLine } from "./diff";

describe("isPlainObject", () => {
  it("should return true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ key: "value" })).toBe(true);
    expect(isPlainObject({ nested: { obj: true } })).toBe(true);
  });

  it("should return false for arrays", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it("should return false for null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("should return false for primitives", () => {
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(123)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

describe("computeJsonDiff", () => {
  describe("Object-level diffing", () => {
    it("should detect added keys", () => {
      const before = { name: "John" };
      const after = { name: "John", age: 30 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"age"'))).toBe(true);
      expect(diff?.some((line) => line.type === "unchanged" && line.content.includes('"name"'))).toBe(true);
    });

    it("should detect removed keys", () => {
      const before = { name: "John", age: 30 };
      const after = { name: "John" };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"age"'))).toBe(true);
      expect(diff?.some((line) => line.type === "unchanged" && line.content.includes('"name"'))).toBe(true);
    });

    it("should detect changed values", () => {
      const before = { name: "John", age: 30 };
      const after = { name: "John", age: 31 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("30"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("31"))).toBe(true);
      expect(diff?.some((line) => line.type === "unchanged" && line.content.includes('"name"'))).toBe(true);
    });

    it("should detect unchanged objects", () => {
      const before = { name: "John", age: 30 };
      const after = { name: "John", age: 30 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.every((line) => line.type === "unchanged" || line.content === "{" || line.content === "}")).toBe(true);
    });

    it("should handle empty objects", () => {
      const before = {};
      const after = { name: "John" };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"name"'))).toBe(true);
    });

    it("should format output with proper braces", () => {
      const before = { name: "John" };
      const after = { name: "Jane" };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.[0].content).toBe("{");
      expect(diff?.[diff.length - 1].content).toBe("}");
    });

    it("should handle multiple key changes", () => {
      const before = { a: 1, b: 2, c: 3 };
      const after = { a: 1, b: 20, d: 4 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "unchanged" && line.content.includes('"a"'))).toBe(true);
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"b"') && line.content.includes("2"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"b"') && line.content.includes("20"))).toBe(true);
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"c"'))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"d"'))).toBe(true);
    });
  });

  describe("Nested objects and arrays", () => {
    it("should handle nested objects in values", () => {
      const before = { user: { name: "John", age: 30 } };
      const after = { user: { name: "Jane", age: 30 } };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // The entire user object should be shown as changed
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"user"'))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"user"'))).toBe(true);
    });

    it("should handle arrays in values", () => {
      const before = { tags: ["javascript", "node"] };
      const after = { tags: ["javascript", "typescript"] };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("node"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("typescript"))).toBe(true);
    });

    it("should handle null values", () => {
      const before = { value: null };
      const after = { value: "something" };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("null"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"something"'))).toBe(true);
    });

    it("should handle undefined values", () => {
      const before = { value: undefined };
      const after = { value: "something" };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("undefined"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"something"'))).toBe(true);
    });

    it("should handle deeply nested structures", () => {
      const before = {
        level1: {
          level2: {
            level3: {
              value: "deep"
            }
          }
        }
      };
      const after = {
        level1: {
          level2: {
            level3: {
              value: "deeper"
            }
          }
        }
      };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"deep"'))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"deeper"'))).toBe(true);
    });
  });

  describe("JSON string parsing within objects", () => {
    it("should parse and format JSON strings in values", () => {
      const before = { data: '{"name":"John"}' };
      const after = { data: '{"name":"Jane"}' };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // The JSON string should be parsed and formatted
      expect(diff?.some((line) => line.content.includes("John"))).toBe(true);
      expect(diff?.some((line) => line.content.includes("Jane"))).toBe(true);
    });

    it("should handle JSON array strings", () => {
      const before = { data: '[1,2,3]' };
      const after = { data: '[1,2,4]' };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed")).toBe(true);
      expect(diff?.some((line) => line.type === "added")).toBe(true);
    });

    it("should handle invalid JSON strings as regular strings", () => {
      const before = { data: '{invalid json}' };
      const after = { data: '{still invalid}' };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("invalid json"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("still invalid"))).toBe(true);
    });

    it("should not parse short strings that happen to start with { or [", () => {
      const before = { data: '{x}' };
      const after = { data: '{y}' };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // Short strings (length <= 2 after trimming braces) should not be parsed
      expect(diff?.some((line) => line.content.includes('"{x}"') || line.content.includes("{x}"))).toBe(true);
    });
  });

  describe("Line-level diffing for non-objects", () => {
    it("should use line-level diff for arrays", () => {
      const before = [1, 2, 3];
      const after = [1, 2, 4];
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("3"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("4"))).toBe(true);
    });

    it("should use line-level diff for strings", () => {
      const before = "hello\nworld";
      const after = "hello\nuniverse";
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("world"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("universe"))).toBe(true);
    });

    it("should use line-level diff for numbers", () => {
      const before = 123;
      const after = 456;
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("123"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("456"))).toBe(true);
    });

    it("should use line-level diff for booleans", () => {
      const before = true;
      const after = false;
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("true"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("false"))).toBe(true);
    });

    it("should handle arrays with added elements", () => {
      const before = [1, 2];
      const after = [1, 2, 3];
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "added" && line.content.includes("3"))).toBe(true);
    });

    it("should handle arrays with removed elements", () => {
      const before = [1, 2, 3];
      const after = [1, 2];
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("3"))).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle identical objects", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const diff = computeJsonDiff(obj, obj);

      expect(diff).toBeTruthy();
      expect(diff?.every((line) => line.type === "unchanged")).toBe(true);
    });

    it("should handle empty objects", () => {
      const before = {};
      const after = {};
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.length).toBe(2); // Just { and }
      expect(diff?.[0].content).toBe("{");
      expect(diff?.[1].content).toBe("}");
    });

    it("should handle completely different objects", () => {
      const before = { a: 1, b: 2 };
      const after = { c: 3, d: 4 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"a"'))).toBe(true);
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"b"'))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"c"'))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes('"d"'))).toBe(true);
    });

    it("should sort keys alphabetically", () => {
      const before = { z: 1, a: 2, m: 3 };
      const after = { z: 1, a: 2, m: 3 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // Find the positions of keys in the diff
      const aIndex = diff?.findIndex((line) => line.content.includes('"a"'));
      const mIndex = diff?.findIndex((line) => line.content.includes('"m"'));
      const zIndex = diff?.findIndex((line) => line.content.includes('"z"'));

      expect(aIndex).toBeLessThan(mIndex!);
      expect(mIndex).toBeLessThan(zIndex!);
    });

    it("should handle special characters in keys", () => {
      const before = { "key-with-dashes": "value" };
      const after = { "key-with-dashes": "new-value" };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.content.includes("key-with-dashes"))).toBe(true);
    });

    it("should handle numeric keys", () => {
      const before = { "123": "value1" };
      const after = { "123": "value2" };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.content.includes('"123"'))).toBe(true);
    });

    it("should handle mixed types in array", () => {
      const before = [1, "string", true, null, { key: "value" }];
      const after = [1, "different", true, null, { key: "value" }];
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes("string"))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("different"))).toBe(true);
    });
  });

  describe("Comma handling", () => {
    it("should not add comma to last property", () => {
      const before = { a: 1, b: 2 };
      const after = { a: 1, b: 2 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // Find the last property line (before the closing brace)
      const lastPropLine = diff?.[diff.length - 2];
      expect(lastPropLine?.content.endsWith(",")).toBe(false);
    });

    it("should add comma to non-last properties", () => {
      const before = { a: 1, b: 2, c: 3 };
      const after = { a: 1, b: 2, c: 3 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // Find property lines (exclude { and })
      const propertyLines = diff?.filter(
        (line) => line.content.includes('"a"') || line.content.includes('"b"')
      );
      expect(propertyLines?.every((line) => line.content.includes(","))).toBe(true);
    });
  });

  describe("Multi-line value formatting", () => {
    it("should format multi-line object values correctly", () => {
      const before = {
        nested: {
          deeply: {
            value: "test"
          }
        }
      };
      const after = { nested: { deeply: { value: "test" } } };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // Should have multiple lines for the nested object
      const nestedLines = diff?.filter((line) => line.content.includes("deeply") || line.content.includes("value"));
      expect(nestedLines && nestedLines.length > 1).toBe(true);
    });

    it("should format multi-line array values correctly", () => {
      const before = {
        items: [
          { id: 1, name: "first" },
          { id: 2, name: "second" }
        ]
      };
      const after = { items: [{ id: 1, name: "first" }, { id: 2, name: "second" }] };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      // Should have multiple lines for the array
      expect(diff && diff.length > 5).toBe(true); // More than just { "items": [], }
    });
  });

  describe("Error handling", () => {
    it("should return null for circular references", () => {
      const before: any = { a: 1 };
      before.circular = before;

      const after = { a: 1 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeNull();
    });

    it("should handle comparison of mixed types gracefully", () => {
      const before = { value: "string" };
      const after = { value: 123 };
      const diff = computeJsonDiff(before, after);

      expect(diff).toBeTruthy();
      expect(diff?.some((line) => line.type === "removed" && line.content.includes('"string"'))).toBe(true);
      expect(diff?.some((line) => line.type === "added" && line.content.includes("123"))).toBe(true);
    });
  });
});
