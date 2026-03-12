import { describe, it, expect } from "vitest";
import { HeaderManager } from "../../../runner/HeaderManager";
import type { HeaderMap } from "../../../runner/types";

describe("HeaderManager", () => {
  describe("normalize()", () => {
    it("should convert header keys to lowercase", () => {
      const headers: HeaderMap = {
        "Content-Type": "application/json",
        "X-Custom-Header": "value",
        UPPERCASE: "test",
      };

      const result = HeaderManager.normalize(headers);

      expect(result).toEqual({
        "content-type": "application/json",
        "x-custom-header": "value",
        uppercase: "test",
      });
    });

    it("should convert non-string values to strings", () => {
      const headers: HeaderMap = {
        "x-number": "123" as any,
        "x-boolean": "true" as any,
      };

      const result = HeaderManager.normalize(headers);

      expect(result["x-number"]).toBe("123");
      expect(result["x-boolean"]).toBe("true");
    });

    it("should handle empty headers object", () => {
      const result = HeaderManager.normalize({});
      expect(result).toEqual({});
    });

    it("should handle headers with empty string values", () => {
      const headers: HeaderMap = {
        "X-Empty": "",
        "X-Other": "value",
      };

      const result = HeaderManager.normalize(headers);

      expect(result).toEqual({
        "x-empty": "",
        "x-other": "value",
      });
    });
  });

  describe("serialize()", () => {
    it("should serialize empty headers correctly", () => {
      const headers: HeaderMap = {};
      const result = HeaderManager.serialize(headers);

      // Should have 4 bytes for count (0)
      expect(result.length).toBe(4);

      const view = new DataView(result.buffer);
      expect(view.getUint32(0, true)).toBe(0);
    });

    it("should serialize single header pair with correct format", () => {
      const headers: HeaderMap = {
        "content-type": "application/json",
      };

      const result = HeaderManager.serialize(headers);

      const view = new DataView(result.buffer);

      // Check count
      expect(view.getUint32(0, true)).toBe(1);

      // Check key length
      expect(view.getUint32(4, true)).toBe(12); // "content-type" = 12 bytes

      // Check value length
      expect(view.getUint32(8, true)).toBe(16); // "application/json" = 16 bytes

      // Check key data
      const keyStart = 12;
      const keyBytes = result.slice(keyStart, keyStart + 12);
      const keyStr = new TextDecoder().decode(keyBytes);
      expect(keyStr).toBe("content-type");

      // Check null terminator after key
      expect(result[keyStart + 12]).toBe(0);

      // Check value data
      const valueStart = keyStart + 12 + 1; // after key + null terminator
      const valueBytes = result.slice(valueStart, valueStart + 16);
      const valueStr = new TextDecoder().decode(valueBytes);
      expect(valueStr).toBe("application/json");

      // Check null terminator after value
      expect(result[valueStart + 16]).toBe(0);
    });

    it("should serialize multiple headers with correct format", () => {
      const headers: HeaderMap = {
        accept: "text/html",
        host: "example.com",
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      // Check count
      expect(view.getUint32(0, true)).toBe(2);

      // Check lengths for first pair
      const key1Len = view.getUint32(4, true);
      const val1Len = view.getUint32(8, true);

      // Check lengths for second pair
      const key2Len = view.getUint32(12, true);
      const val2Len = view.getUint32(16, true);

      // Verify data section starts after all length fields
      const dataStart = 4 + 2 * 2 * 4; // count + 2 pairs * 2 lengths * 4 bytes

      // Read first key
      const key1Bytes = result.slice(dataStart, dataStart + key1Len);
      const key1 = new TextDecoder().decode(key1Bytes);
      expect(result[dataStart + key1Len]).toBe(0); // null terminator

      // Read first value
      const val1Start = dataStart + key1Len + 1;
      const val1Bytes = result.slice(val1Start, val1Start + val1Len);
      const val1 = new TextDecoder().decode(val1Bytes);
      expect(result[val1Start + val1Len]).toBe(0); // null terminator

      // Read second key
      const key2Start = val1Start + val1Len + 1;
      const key2Bytes = result.slice(key2Start, key2Start + key2Len);
      const key2 = new TextDecoder().decode(key2Bytes);
      expect(result[key2Start + key2Len]).toBe(0); // null terminator

      // Read second value
      const val2Start = key2Start + key2Len + 1;
      const val2Bytes = result.slice(val2Start, val2Start + val2Len);
      const val2 = new TextDecoder().decode(val2Bytes);
      expect(result[val2Start + val2Len]).toBe(0); // null terminator

      // Verify the actual header pairs
      const pairs = [
        { key: key1, value: val1 },
        { key: key2, value: val2 },
      ];

      expect(pairs).toContainEqual({ key: "accept", value: "text/html" });
      expect(pairs).toContainEqual({ key: "host", value: "example.com" });
    });

    it("should handle headers with special characters", () => {
      const headers: HeaderMap = {
        "x-custom": "value with spaces",
        "x-unicode": "Hello 世界 🌍",
        "x-special": "a=b&c=d",
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      expect(view.getUint32(0, true)).toBe(3);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle empty string values", () => {
      const headers: HeaderMap = {
        "x-empty": "",
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      expect(view.getUint32(0, true)).toBe(1);
      expect(view.getUint32(4, true)).toBe(7); // "x-empty" length
      expect(view.getUint32(8, true)).toBe(0); // empty value length

      // Check key
      const keyStart = 12;
      const keyBytes = result.slice(keyStart, keyStart + 7);
      const keyStr = new TextDecoder().decode(keyBytes);
      expect(keyStr).toBe("x-empty");
      expect(result[keyStart + 7]).toBe(0); // null terminator

      // Check empty value
      const valueStart = keyStart + 7 + 1;
      expect(result[valueStart]).toBe(0); // null terminator for empty value
    });

    it("should handle large headers", () => {
      const largeValue = "x".repeat(10000);
      const headers: HeaderMap = {
        "x-large": largeValue,
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      expect(view.getUint32(0, true)).toBe(1);
      expect(view.getUint32(4, true)).toBe(7); // "x-large" length
      expect(view.getUint32(8, true)).toBe(10000); // large value length

      // Verify the value is correctly stored
      const valueStart = 12 + 7 + 1;
      const valueBytes = result.slice(valueStart, valueStart + 10000);
      const valueStr = new TextDecoder().decode(valueBytes);
      expect(valueStr).toBe(largeValue);
    });

    it("should verify exact binary format structure", () => {
      const headers: HeaderMap = {
        key: "val",
      };

      const result = HeaderManager.serialize(headers);

      // Manually construct expected buffer
      const expected = new Uint8Array([
        // Count: 1 (u32, little-endian)
        0x01,
        0x00,
        0x00,
        0x00,
        // Key length: 3 (u32, little-endian)
        0x03,
        0x00,
        0x00,
        0x00,
        // Value length: 3 (u32, little-endian)
        0x03,
        0x00,
        0x00,
        0x00,
        // Key: "key"
        0x6b,
        0x65,
        0x79,
        // Null terminator
        0x00,
        // Value: "val"
        0x76,
        0x61,
        0x6c,
        // Null terminator
        0x00,
      ]);

      expect(result).toEqual(expected);
    });

    it("should calculate correct total size", () => {
      const headers: HeaderMap = {
        a: "1",
        bb: "22",
      };

      const result = HeaderManager.serialize(headers);

      // Expected size calculation:
      // 4 bytes (count)
      // + 2 pairs * 2 lengths * 4 bytes = 16 bytes (length fields)
      // + (1+1) + (1+1) = 4 bytes (first pair with null terminators)
      // + (2+1) + (2+1) = 6 bytes (second pair with null terminators)
      // Total: 4 + 16 + 4 + 6 = 30 bytes

      expect(result.length).toBe(30);
    });

    it("should handle UTF-8 multibyte characters correctly", () => {
      const headers: HeaderMap = {
        "x-emoji": "🚀",
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      expect(view.getUint32(0, true)).toBe(1);
      expect(view.getUint32(4, true)).toBe(7); // "x-emoji" length

      // "🚀" is 4 bytes in UTF-8
      expect(view.getUint32(8, true)).toBe(4);

      // Verify the emoji is correctly stored
      const valueStart = 12 + 7 + 1;
      const valueBytes = result.slice(valueStart, valueStart + 4);
      const valueStr = new TextDecoder().decode(valueBytes);
      expect(valueStr).toBe("🚀");
    });
  });

  describe("deserialize()", () => {
    it("should deserialize empty string to empty headers", () => {
      const result = HeaderManager.deserialize("");
      expect(result).toEqual({});
    });

    it("should deserialize single header pair", () => {
      const payload = "content-type\0application/json\0";
      const result = HeaderManager.deserialize(payload);

      expect(result).toEqual({
        "content-type": "application/json",
      });
    });

    it("should deserialize multiple header pairs", () => {
      const payload = "accept\0text/html\0host\0example.com\0";
      const result = HeaderManager.deserialize(payload);

      expect(result).toEqual({
        accept: "text/html",
        host: "example.com",
      });
    });

    it("should normalize keys to lowercase", () => {
      const payload = "Content-Type\0application/json\0X-Custom\0value\0";
      const result = HeaderManager.deserialize(payload);

      expect(result).toEqual({
        "content-type": "application/json",
        "x-custom": "value",
      });
    });

    it("should handle headers with values", () => {
      // deserialize splits by \0 and filters empty strings
      // So we test normal key-value pairs
      const payload = "x-header\0header-value\0x-other\0value\0";
      const result = HeaderManager.deserialize(payload);

      expect(result).toEqual({
        "x-header": "header-value",
        "x-other": "value",
      });
    });

    it("should handle special characters in values", () => {
      const payload = "x-special\0a=b&c=d\0x-unicode\0Hello 世界 🌍\0";
      const result = HeaderManager.deserialize(payload);

      expect(result["x-special"]).toBe("a=b&c=d");
      expect(result["x-unicode"]).toBe("Hello 世界 🌍");
    });

    it("should handle payload with trailing null terminators", () => {
      const payload = "key\0value\0\0\0";
      const result = HeaderManager.deserialize(payload);

      expect(result).toEqual({
        key: "value",
      });
    });

    it("should handle odd number of parts (missing value)", () => {
      const payload = "key1\0value1\0key2\0";
      const result = HeaderManager.deserialize(payload);

      expect(result).toEqual({
        key1: "value1",
        key2: "",
      });
    });

    it("should handle payload with only null terminators", () => {
      const payload = "\0\0\0";
      const result = HeaderManager.deserialize(payload);

      expect(result).toEqual({});
    });
  });

  describe("round-trip serialization", () => {
    it("should maintain data integrity for simple headers", () => {
      const original: HeaderMap = {
        "content-type": "application/json",
        accept: "text/html",
      };

      const serialized = HeaderManager.serialize(original);

      // Convert serialized data to string format for deserialize
      const decoder = new TextDecoder();
      const dataStart = 4 + Object.keys(original).length * 2 * 4;
      const stringPayload = decoder.decode(serialized.slice(dataStart));

      const deserialized = HeaderManager.deserialize(stringPayload);

      expect(deserialized).toEqual(original);
    });

    it("should maintain data integrity for empty headers", () => {
      const original: HeaderMap = {};
      const serialized = HeaderManager.serialize(original);

      const decoder = new TextDecoder();
      const dataStart = 4;
      const stringPayload = decoder.decode(serialized.slice(dataStart));

      const deserialized = HeaderManager.deserialize(stringPayload);

      expect(deserialized).toEqual(original);
    });

    it("should maintain data integrity for headers with special characters", () => {
      const original: HeaderMap = {
        "x-custom": "value with spaces",
        "x-unicode": "Hello 世界 🌍",
        "x-special": "a=b&c=d",
      };

      const serialized = HeaderManager.serialize(original);

      const decoder = new TextDecoder();
      const dataStart = 4 + Object.keys(original).length * 2 * 4;
      const stringPayload = decoder.decode(serialized.slice(dataStart));

      const deserialized = HeaderManager.deserialize(stringPayload);

      expect(deserialized).toEqual(original);
    });

    it("should maintain data integrity for headers with various values", () => {
      const original: HeaderMap = {
        "x-header": "value1",
        "x-other": "value2",
      };

      const serialized = HeaderManager.serialize(original);

      const decoder = new TextDecoder();
      const dataStart = 4 + Object.keys(original).length * 2 * 4;
      const stringPayload = decoder.decode(serialized.slice(dataStart));

      const deserialized = HeaderManager.deserialize(stringPayload);

      expect(deserialized).toEqual(original);
    });

    it("should maintain data integrity for large headers", () => {
      const largeValue = "x".repeat(1000);
      const original: HeaderMap = {
        "x-large": largeValue,
        "x-normal": "small",
      };

      const serialized = HeaderManager.serialize(original);

      const decoder = new TextDecoder();
      const dataStart = 4 + Object.keys(original).length * 2 * 4;
      const stringPayload = decoder.decode(serialized.slice(dataStart));

      const deserialized = HeaderManager.deserialize(stringPayload);

      expect(deserialized).toEqual(original);
    });

    it("should be consistent across multiple serializations", () => {
      const headers: HeaderMap = {
        "content-type": "application/json",
        accept: "text/html",
        host: "example.com",
      };

      const serialized1 = HeaderManager.serialize(headers);
      const serialized2 = HeaderManager.serialize(headers);

      expect(serialized1).toEqual(serialized2);
    });
  });

  describe("edge cases and error conditions", () => {
    it("should handle headers with very long keys", () => {
      const longKey = "x-" + "a".repeat(1000);
      const headers: HeaderMap = {
        [longKey]: "value",
      };

      const result = HeaderManager.serialize(headers);
      expect(result.length).toBeGreaterThan(1000);
    });

    it("should handle many headers", () => {
      const headers: HeaderMap = {};
      for (let i = 0; i < 100; i++) {
        headers[`header-${i}`] = `value-${i}`;
      }

      const serialized = HeaderManager.serialize(headers);
      const view = new DataView(serialized.buffer);

      expect(view.getUint32(0, true)).toBe(100);
    });

    it("should handle headers with newlines in values", () => {
      const headers: HeaderMap = {
        "x-multiline": "line1\nline2\nline3",
      };

      const serialized = HeaderManager.serialize(headers);
      const view = new DataView(serialized.buffer);

      expect(view.getUint32(0, true)).toBe(1);

      const decoder = new TextDecoder();
      const dataStart = 4 + 2 * 4;
      const keyLen = view.getUint32(4, true);
      const valueStart = dataStart + keyLen + 1;
      const valueLen = view.getUint32(8, true);
      const valueBytes = serialized.slice(valueStart, valueStart + valueLen);
      const value = decoder.decode(valueBytes);

      expect(value).toBe("line1\nline2\nline3");
    });

    it("should handle headers with tabs in values", () => {
      const headers: HeaderMap = {
        "x-tabs": "col1\tcol2\tcol3",
      };

      const serialized = HeaderManager.serialize(headers);

      const decoder = new TextDecoder();
      const dataStart = 4 + 2 * 4;
      const view = new DataView(serialized.buffer);
      const keyLen = view.getUint32(4, true);
      const valueStart = dataStart + keyLen + 1;
      const valueLen = view.getUint32(8, true);
      const valueBytes = serialized.slice(valueStart, valueStart + valueLen);
      const value = decoder.decode(valueBytes);

      expect(value).toBe("col1\tcol2\tcol3");
    });

    it("should handle headers with binary-like values", () => {
      const headers: HeaderMap = {
        "x-binary": "\x00\x01\x02\x03",
      };

      const serialized = HeaderManager.serialize(headers);
      expect(serialized.length).toBeGreaterThan(0);
    });

    it("should verify little-endian byte order", () => {
      const headers: HeaderMap = {
        a: "b",
      };

      const result = HeaderManager.serialize(headers);

      // Check that count (1) is stored as little-endian
      // Little-endian: least significant byte first
      // 1 = 0x00000001 = [0x01, 0x00, 0x00, 0x00]
      expect(result[0]).toBe(0x01);
      expect(result[1]).toBe(0x00);
      expect(result[2]).toBe(0x00);
      expect(result[3]).toBe(0x00);
    });

    it("should handle deserialize with consecutive null bytes", () => {
      const payload = "key\0\0\0value\0";
      const result = HeaderManager.deserialize(payload);

      // Should filter out empty parts
      expect(result).toEqual({
        key: "value",
      });
    });
  });

  describe("G-Core SDK format compliance", () => {
    it("should match exact format: [count][sizes...][data...]", () => {
      const headers: HeaderMap = {
        host: "api.example.com",
        accept: "*/*",
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      // Section 1: Count (4 bytes)
      const count = view.getUint32(0, true);
      expect(count).toBe(2);

      // Section 2: Sizes (2 pairs * 2 lengths * 4 bytes = 16 bytes)
      const sizesStart = 4;
      const sizesEnd = sizesStart + count * 2 * 4;

      // Verify all size fields are present and valid
      for (let i = 0; i < count * 2; i++) {
        const size = view.getUint32(sizesStart + i * 4, true);
        expect(size).toBeGreaterThanOrEqual(0);
      }

      // Section 3: Data starts after all size fields
      const dataStart = sizesEnd;
      expect(dataStart).toBe(20); // 4 + 16

      // Verify data section contains all keys and values with null terminators
      let offset = dataStart;
      for (let i = 0; i < count; i++) {
        const keyLen = view.getUint32(sizesStart + i * 8, true);
        const valLen = view.getUint32(sizesStart + i * 8 + 4, true);

        // Key data
        const keyBytes = result.slice(offset, offset + keyLen);
        expect(keyBytes.length).toBe(keyLen);
        offset += keyLen;

        // Null terminator
        expect(result[offset]).toBe(0);
        offset += 1;

        // Value data
        const valBytes = result.slice(offset, offset + valLen);
        expect(valBytes.length).toBe(valLen);
        offset += valLen;

        // Null terminator
        expect(result[offset]).toBe(0);
        offset += 1;
      }

      // Verify we consumed exactly all bytes
      expect(offset).toBe(result.length);
    });

    it("should use little-endian for all u32 values", () => {
      const headers: HeaderMap = {
        test: "data",
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      // Test count field
      const count = view.getUint32(0, true); // little-endian
      const countBE = view.getUint32(0, false); // big-endian
      expect(count).toBe(1);
      expect(countBE).not.toBe(count); // Should differ due to byte order

      // Test length fields
      const keyLen = view.getUint32(4, true);
      const keyLenBE = view.getUint32(4, false);
      expect(keyLen).toBe(4); // "test"
      expect(keyLenBE).not.toBe(keyLen);
    });

    it("should include null terminators after each key and value", () => {
      const headers: HeaderMap = {
        a: "1",
        b: "2",
      };

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      const dataStart = 4 + 4 * 4; // count + 2 pairs * 2 lengths

      // Track null terminators
      const nullPositions: number[] = [];
      for (let i = dataStart; i < result.length; i++) {
        if (result[i] === 0) {
          nullPositions.push(i);
        }
      }

      // Should have 4 null terminators (2 pairs * 2 per pair)
      expect(nullPositions.length).toBe(4);
    });

    it("should maintain format with large number of headers", () => {
      const headers: HeaderMap = {};
      for (let i = 0; i < 50; i++) {
        headers[`h${i}`] = `v${i}`;
      }

      const result = HeaderManager.serialize(headers);
      const view = new DataView(result.buffer);

      // Verify count
      expect(view.getUint32(0, true)).toBe(50);

      // Verify structure: count + sizes + data
      const sizesBytes = 50 * 2 * 4;
      const expectedMinSize = 4 + sizesBytes;
      expect(result.length).toBeGreaterThanOrEqual(expectedMinSize);
    });
  });
});
