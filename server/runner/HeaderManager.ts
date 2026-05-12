import type { HeaderMap, HeaderRecord, HeaderTuples } from "./types";

const textEncoder = new TextEncoder();

export class HeaderManager {
  // Read a header value as a single string. For multi-valued headers (string[]) returns the first.
  // Use when callers know the header is conventionally single-valued (content-type, host, location, etc.)
  // and need to satisfy APIs that take a string.
  static firstValue(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v;
  }

  // Flatten a HeaderRecord to a HeaderMap (single string per key) for consumers
  // that can't handle multi-valued headers (e.g. fetch's HeadersInit).
  // Multi-valued entries are joined with ", " — caller must be sure this is acceptable
  // (NOT valid for Set-Cookie; route those through a separate channel).
  static flattenToMap(headers: HeaderMap | HeaderRecord): HeaderMap {
    const flat: HeaderMap = {};
    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) {
        flat[k] = v.join(", ");
      } else if (v !== undefined) {
        flat[k] = String(v);
      }
    }
    return flat;
  }

  static normalize(headers: HeaderMap | HeaderRecord): HeaderRecord {
    // Null-prototype object: a header named `__proto__` or `constructor` is
    // stored as an own property rather than triggering prototype setters or
    // colliding with inherited members. Treat the return as a plain dictionary.
    const normalized: HeaderRecord = Object.create(null) as HeaderRecord;
    for (const [key, value] of Object.entries(headers)) {
      const k = key.toLowerCase();
      if (Array.isArray(value)) {
        normalized[k] = value.map(String);
      } else {
        normalized[k] = String(value);
      }
    }
    return normalized;
  }

  // Append-merge two header records: for keys present in both, values are
  // concatenated into a string[] rather than the right-hand side overwriting
  // the left. Keys are lowercased on the way in (consistent with `normalize`).
  //
  // Used by the runner to combine request-phase response-header state with
  // the origin's response headers, mirroring how Envoy serves
  // `add_http_response_header` calls issued during onRequestHeaders /
  // onRequestBody against the actual upstream response — both values survive
  // as a multi-value list (preserving the proxy-wasm cross-phase pattern).
  static appendMerge(
    left: HeaderMap | HeaderRecord,
    right: HeaderMap | HeaderRecord,
  ): HeaderRecord {
    // `normalize(left)` returns a null-prototype object, so prototype-chain
    // members (constructor, __proto__, toString, etc.) cannot leak into the
    // `Object.hasOwn` check below and incoming names like `__proto__` cannot
    // pollute the prototype via assignment. `Object.hasOwn` is belt-and-
    // suspenders — explicit own-property intent even though the null
    // prototype already eliminates inheritance.
    const result = HeaderManager.normalize(left);
    for (const [key, value] of Object.entries(right)) {
      const k = key.toLowerCase();
      const incoming = Array.isArray(value)
        ? value.map(String)
        : [String(value)];
      if (Object.hasOwn(result, k)) {
        const existing = result[k];
        const existingArr = Array.isArray(existing) ? existing : [existing];
        result[k] = [...existingArr, ...incoming];
      } else {
        result[k] = incoming.length === 1 ? incoming[0] : incoming;
      }
    }
    return result;
  }

  static serialize(headers: HeaderMap): Uint8Array {
    // Kong proxy-wasm AssemblyScript SDK format:
    // [num_pairs: u32][key1_len: u32][val1_len: u32][key2_len: u32][val2_len: u32]...[key1_bytes][0x00][val1_bytes][0x00]...
    const pairs = Object.entries(headers);
    const numPairs = pairs.length;

    // Encode all pairs
    const encoded: Array<{ key: Uint8Array; value: Uint8Array }> = [];
    let dataSize = 0;
    for (const [key, value] of pairs) {
      const keyBytes = textEncoder.encode(key);
      const valBytes = textEncoder.encode(value);
      encoded.push({ key: keyBytes, value: valBytes });
      // Add 1 byte for null terminator after each key and value
      dataSize += keyBytes.length + 1 + valBytes.length + 1;
    }

    // Total size: 1 u32 for count + (2 * numPairs) u32s for sizes + data with null terminators
    const totalSize = 4 + numPairs * 2 * 4 + dataSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Write header count
    view.setUint32(0, numPairs, true);

    // Write all lengths
    let offset = 4;
    for (const { key, value } of encoded) {
      view.setUint32(offset, key.length, true);
      offset += 4;
      view.setUint32(offset, value.length, true);
      offset += 4;
    }

    // Write all data with null terminators
    for (const { key, value } of encoded) {
      bytes.set(key, offset);
      offset += key.length;
      bytes[offset] = 0; // null terminator
      offset += 1;

      bytes.set(value, offset);
      offset += value.length;
      bytes[offset] = 0; // null terminator
      offset += 1;
    }

    return bytes;
  }

  /**
   * Deserializes a proxy-wasm binary header map format:
   * [num_pairs: u32 LE][key1_len: u32 LE][val1_len: u32 LE]...[key1_bytes\0][val1_bytes\0]...
   */
  static deserializeBinary(bytes: Uint8Array): HeaderMap {
    if (bytes.length < 4) return {};
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numPairs = view.getUint32(0, true);
    const lengths: Array<{ keyLen: number; valLen: number }> = [];
    let offset = 4;
    for (let i = 0; i < numPairs; i++) {
      const keyLen = view.getUint32(offset, true);
      offset += 4;
      const valLen = view.getUint32(offset, true);
      offset += 4;
      lengths.push({ keyLen, valLen });
    }
    const decoder = new TextDecoder();
    const headers: HeaderMap = {};
    for (const { keyLen, valLen } of lengths) {
      const key = decoder.decode(bytes.slice(offset, offset + keyLen));
      offset += keyLen + 1; // skip null terminator
      const value = decoder.decode(bytes.slice(offset, offset + valLen));
      offset += valLen + 1; // skip null terminator
      headers[key.toLowerCase()] = value;
    }
    return headers;
  }

  static deserialize(payload: string): HeaderMap {
    const parts = payload.split("\0").filter((part) => part.length > 0);
    const headers: HeaderMap = {};
    for (let i = 0; i < parts.length; i += 2) {
      const key = parts[i];
      const value = parts[i + 1] ?? "";
      headers[key.toLowerCase()] = value;
    }
    return headers;
  }

  // --- Tuple-based methods for multi-valued header support ---

  static recordToTuples(headers: HeaderMap | HeaderRecord): HeaderTuples {
    const tuples: HeaderTuples = [];
    for (const [k, v] of Object.entries(headers)) {
      const key = k.toLowerCase();
      if (Array.isArray(v)) {
        for (const val of v) tuples.push([key, String(val)]);
      } else if (v !== undefined) {
        tuples.push([key, String(v)]);
      }
    }
    return tuples;
  }

  // Lossless projection of tuples to a Record: single-valued keys are string,
  // multi-valued keys are string[] — matching Node's IncomingHttpHeaders shape.
  // Set-Cookie and other legitimately-repeatable headers are preserved across duplicates.
  static tuplesToRecord(tuples: HeaderTuples): HeaderRecord {
    const record: HeaderRecord = {};
    for (const [key, value] of tuples) {
      const existing = record[key];
      if (existing === undefined) {
        record[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        record[key] = [existing, value];
      }
    }
    return record;
  }

  static normalizeTuples(tuples: HeaderTuples): HeaderTuples {
    return tuples.map(([k, v]) => [k.toLowerCase(), String(v)]);
  }

  static serializeTuples(tuples: HeaderTuples): Uint8Array {
    const numPairs = tuples.length;

    const encoded: Array<{ key: Uint8Array; value: Uint8Array }> = [];
    let dataSize = 0;
    for (const [key, value] of tuples) {
      const keyBytes = textEncoder.encode(key);
      const valBytes = textEncoder.encode(value);
      encoded.push({ key: keyBytes, value: valBytes });
      dataSize += keyBytes.length + 1 + valBytes.length + 1;
    }

    const totalSize = 4 + numPairs * 2 * 4 + dataSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint32(0, numPairs, true);

    let offset = 4;
    for (const { key, value } of encoded) {
      view.setUint32(offset, key.length, true);
      offset += 4;
      view.setUint32(offset, value.length, true);
      offset += 4;
    }

    for (const { key, value } of encoded) {
      bytes.set(key, offset);
      offset += key.length;
      bytes[offset] = 0;
      offset += 1;

      bytes.set(value, offset);
      offset += value.length;
      bytes[offset] = 0;
      offset += 1;
    }

    return bytes;
  }

  static deserializeBinaryToTuples(bytes: Uint8Array): HeaderTuples {
    if (bytes.length < 4) return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numPairs = view.getUint32(0, true);
    const lengths: Array<{ keyLen: number; valLen: number }> = [];
    let offset = 4;
    for (let i = 0; i < numPairs; i++) {
      const keyLen = view.getUint32(offset, true);
      offset += 4;
      const valLen = view.getUint32(offset, true);
      offset += 4;
      lengths.push({ keyLen, valLen });
    }
    const decoder = new TextDecoder();
    const tuples: HeaderTuples = [];
    for (const { keyLen, valLen } of lengths) {
      const key = decoder.decode(bytes.slice(offset, offset + keyLen));
      offset += keyLen + 1;
      const value = decoder.decode(bytes.slice(offset, offset + valLen));
      offset += valLen + 1;
      tuples.push([key.toLowerCase(), value]);
    }
    return tuples;
  }

  static deserializeToTuples(payload: string): HeaderTuples {
    const parts = payload.split("\0").filter((part) => part.length > 0);
    const tuples: HeaderTuples = [];
    for (let i = 0; i < parts.length; i += 2) {
      const key = parts[i];
      const value = parts[i + 1] ?? "";
      tuples.push([key.toLowerCase(), value]);
    }
    return tuples;
  }
}
