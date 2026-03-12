import type { HeaderMap } from "./types";

const textEncoder = new TextEncoder();

export class HeaderManager {
  static normalize(headers: HeaderMap): HeaderMap {
    const normalized: HeaderMap = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = String(value);
    }
    return normalized;
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
}
