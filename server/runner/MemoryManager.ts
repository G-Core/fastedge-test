const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type LogCallback = (level: number, message: string) => void;

export class MemoryManager {
  private memory: WebAssembly.Memory | null = null;
  private instance: WebAssembly.Instance | null = null;
  private hostAllocOffset = 0;
  private logCallback: LogCallback | null = null;
  private isInitializing = false;

  setMemory(memory: WebAssembly.Memory): void {
    this.memory = memory;
  }

  setInstance(instance: WebAssembly.Instance): void {
    this.instance = instance;
  }

  reset(): void {
    this.hostAllocOffset = 0;
  }

  setLogCallback(callback: LogCallback): void {
    this.logCallback = callback;
  }

  setInitializing(initializing: boolean): void {
    this.isInitializing = initializing;
  }

  readBytes(ptr: number, len: number): Uint8Array {
    if (!this.memory) {
      throw new Error("Memory not available");
    }
    const view = new Uint8Array(this.memory.buffer, ptr, len);
    return new Uint8Array(view);
  }

  readString(ptr: number, len: number): string {
    return textDecoder.decode(this.readBytes(ptr, len));
  }

  readOptionalString(ptr: number): string | null {
    if (!ptr || !this.memory) {
      return null;
    }
    const bytes = new Uint8Array(this.memory.buffer, ptr);
    let end = ptr;
    while (end - ptr < bytes.length && bytes[end - ptr] !== 0) {
      end += 1;
    }
    return textDecoder.decode(
      new Uint8Array(this.memory.buffer, ptr, end - ptr),
    );
  }

  writeToWasm(bytes: Uint8Array): number {
    const ptr = this.allocate(bytes.length);
    if (!this.memory) {
      throw new Error("Memory not available");
    }
    if (bytes.length) {
      const view = new Uint8Array(this.memory.buffer, ptr, bytes.length);
      view.set(bytes);
    }
    return ptr;
  }

  writeU32(ptr: number, value: number): void {
    if (!this.memory) {
      throw new Error("Memory not available");
    }
    if (!ptr) {
      return;
    }
    const view = new DataView(this.memory.buffer);
    view.setUint32(ptr, value, true);
  }

  writeStringResult(
    value: string,
    valuePtrPtr: number,
    valueLenPtr: number,
  ): void {
    const bytes = textEncoder.encode(value);
    this.writeBytesResult(bytes, valuePtrPtr, valueLenPtr);
  }

  writeBytesResult(
    bytes: Uint8Array,
    valuePtrPtr: number,
    valueLenPtr: number,
  ): void {
    if (!valuePtrPtr && !valueLenPtr) {
      return;
    }
    const ptr = this.writeToWasm(bytes.length ? bytes : new Uint8Array([0]));
    if (valuePtrPtr) {
      this.writeU32(valuePtrPtr, ptr);
    }
    if (valueLenPtr) {
      this.writeU32(valueLenPtr, bytes.length);
    }
  }

  captureFdWrite(
    fd: number,
    iovs: number,
    iovsLen: number,
    nwritten: number,
  ): number {
    if (!this.memory || iovsLen === 0) {
      return 0;
    }
    const view = new DataView(this.memory.buffer);
    let total = 0;
    let output = "";
    for (let i = 0; i < iovsLen; i += 1) {
      const base = iovs + i * 8;
      const ptr = view.getUint32(base, true);
      const len = view.getUint32(base + 4, true);
      if (len > 0) {
        total += len;
        output += textDecoder.decode(
          new Uint8Array(this.memory.buffer, ptr, len),
        );
      }
    }
    if (output && this.logCallback) {
      const message = output.replace(/\n$/, "");
      // Suppress abort messages during initialization
      if (this.isInitializing && message.includes("abort:")) {
        return total;
      }
      // Try to parse log level from WASI output
      // Format: "[LEVEL] message" or just "message"
      let level = 1; // Default to debug/info
      let cleanMessage = message;

      const levelMatch = message.match(
        /^\[(TRACE|DEBUG|INFO|WARN|ERROR|CRITICAL)\]\s*(.*)$/,
      );
      if (levelMatch) {
        const levelName = levelMatch[1];
        cleanMessage = levelMatch[2];
        const levelMap: Record<string, number> = {
          TRACE: 0,
          DEBUG: 1,
          INFO: 2,
          WARN: 3,
          ERROR: 4,
          CRITICAL: 5,
        };
        level = levelMap[levelName] ?? 1;
      }

      this.logCallback(level, cleanMessage);
    }
    if (nwritten) {
      this.writeU32(nwritten, total);
    }
    return total;
  }

  private allocate(size: number): number {
    if (!this.instance) {
      throw new Error("WASM module not loaded");
    }

    const allocator =
      this.instance.exports.proxy_on_memory_allocate ??
      this.instance.exports.malloc;
    if (typeof allocator !== "function") {
      throw new Error(
        "WASM module must export proxy_on_memory_allocate or malloc",
      );
    }

    const ptr = allocator(size) as number;
    if (ptr !== 0) {
      return ptr;
    }

    return this.hostAllocate(size);
  }

  private hostAllocate(size: number): number {
    if (!this.memory) {
      throw new Error("Memory not available");
    }
    if (this.hostAllocOffset === 0) {
      this.hostAllocOffset = this.memory.buffer.byteLength;
    }
    const alignedSize = size === 0 ? 1 : size;
    const nextOffset = this.hostAllocOffset + alignedSize;
    const currentBytes = this.memory.buffer.byteLength;
    if (nextOffset > currentBytes) {
      const bytesNeeded = nextOffset - currentBytes;
      const pagesNeeded = Math.ceil(bytesNeeded / 65536);
      this.memory.grow(pagesNeeded);
    }
    const ptr = this.hostAllocOffset;
    this.hostAllocOffset = nextOffset;
    return ptr;
  }
}
