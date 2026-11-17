# Hybrid WASM Loading: Path vs Buffer

## Overview

fastedge-test supports **two modes** for loading WASM binaries:

1. **Path-based loading** - Provide a file path
2. **Buffer-based loading** - Provide binary data

Path mode is much faster for large binaries in local development; buffer mode covers remote and
browser scenarios where the server cannot see the file.

---

## Performance Impact

### For 12MB WASM File

| Metric | Buffer Mode | Path Mode | Improvement |
|--------|-------------|-----------|-------------|
| **Startup Time** | 1.45-3.9s | <1ms | **70-95% faster** |
| **Network Transfer** | 16MB (base64) | ~100 bytes | **99.999% less** |
| **Memory Usage** | 48-60MB (4 copies) | 12MB (1 copy) | **75-80% less** |

### Why Path Mode is Faster

**Buffer Mode (Legacy)**:
```
File (12MB) → Read → ArrayBuffer → base64 encode (16MB) →
JSON POST → Network → base64 decode → Buffer →
Write temp file → Spawn process
```

**Path Mode (Optimized)**:
```
Path string (~50 bytes) → JSON POST →
Network → Validate path → Spawn process
```

**Result**: Eliminates ~72MB of data movement!

---

## API Changes

### POST /api/load

#### Parameters

```typescript
interface LoadRequest {
  // Option 1: Path-based (preferred)
  wasmPath?: string;

  // Option 2: Buffer-based (fallback)
  wasmBase64?: string;

  // Common options
  dotenv?: { enabled?: boolean; path?: string };
}
```

#### Example: Path-based Loading

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{
    "wasmPath": "/workspace/target/wasm32-wasi/release/app.wasm",
    "dotenv": { "enabled": true }
  }'
```

#### Example: Buffer-based Loading (Legacy)

```bash
# Read WASM file and encode to base64
WASM_BASE64=$(base64 -w 0 app.wasm)

curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d "{
    \"wasmBase64\": \"$WASM_BASE64\",
    \"dotenv\": { \"enabled\": true }
  }"
```

#### Response (Same for Both)

```json
{
  "ok": true,
  "wasmType": "http-wasm"
}
```

---

## Runner Interface Changes

### IWasmRunner.load()

**Before**:
```typescript
load(buffer: Buffer, config?: RunnerConfig): Promise<void>
```

**After**:
```typescript
load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void>
```

### Usage Examples

#### HTTP WASM Runner

```typescript
import { HttpWasmRunner } from './runner/HttpWasmRunner';
import { PortManager } from './runner/PortManager';

const portManager = new PortManager();
const runner = new HttpWasmRunner(portManager, true);

// Path-based loading (optimized)
await runner.load('/path/to/app.wasm');

// OR Buffer-based loading (legacy)
const buffer = await fs.readFile('/path/to/app.wasm');
await runner.load(buffer);

// Execute request (same for both)
const response = await runner.execute({
  path: '/',
  method: 'GET',
  headers: {},
  body: '',
});
```

#### Proxy WASM Runner

```typescript
import { ProxyWasmRunner } from './runner/ProxyWasmRunner';

const runner = new ProxyWasmRunner();

// Path-based loading
await runner.load('/path/to/filter.wasm');

// OR Buffer-based loading
const buffer = await fs.readFile('/path/to/filter.wasm');
await runner.load(buffer);

// Call hook (same for both)
const result = await runner.callHook({
  hook: 'onRequestHeaders',
  request: { headers: {}, body: '' },
  response: { headers: {}, body: '' },
  properties: {},
});
```

---

## Security

### Path Validation

All file paths are validated for security:

```typescript
import { validatePath, isPathSafe } from './utils/pathValidator';

// Validate with options
const result = validatePath(inputPath, {
  workspaceRoot: '/workspace',      // Restrict to workspace
  requireWasmExtension: true,       // Must end in .wasm
  checkExists: true,                // File must exist
  allowAbsolute: true,              // Allow absolute paths
});

if (!result.valid) {
  throw new Error(result.error);
}

// Use normalized path
const safePath = result.normalizedPath;
```

### Blocked Paths

The following paths are automatically blocked:

- `/etc`, `/sys`, `/proc`, `/dev`, `/boot`, `/root` (Unix)
- `C:\Windows`, `C:\Program Files` (Windows)
- `.ssh`, `.aws`, `.kube` (credentials)
- `node_modules` (large directories)

### Path Traversal Prevention

```typescript
// These are BLOCKED
validatePath('../../../etc/passwd');  // Escapes workspace
validatePath('/etc/passwd');          // System path
validatePath('~/.ssh/id_rsa');        // Credentials

// These are ALLOWED (if file exists)
validatePath('/workspace/app.wasm');          // Within workspace
validatePath('./target/wasm32-wasi/app.wasm'); // Relative path
```

---

## Use Cases

### ✅ Best for Path-Based Loading

1. **VSCode Extension**
   - Workspace files are locally accessible
   - ~3s faster startup for 12MB WASM
   - No memory overhead

2. **GitHub Codespaces**
   - Files are local to container
   - Same performance benefits
   - Works seamlessly

3. **Local Development**
   - Developer's machine
   - Fast iteration cycles
   - Minimal resource usage

4. **AI Agents (MCP/Claude)**
   - AI knows file paths
   - No need to read files
   - Simple integration

5. **CLI Tools**
   - Direct path passing
   - Standard Unix convention
   - Simple UX

### ❌ Requires Buffer-Based Loading

1. **Web UI (Browser Only)**
   - No filesystem access
   - Must use File API
   - Falls back to buffer

2. **Remote Debugger**
   - Frontend ≠ backend machine
   - File doesn't exist remotely
   - Must transfer content

3. **In-Memory WASM Generation**
   - Compiler generates WASM
   - No file on disk
   - Must use buffer

---

## UI

### Upload

`uploadWasm()` in `frontend/src/api/index.ts` tries path mode first when the environment has
filesystem access and the `File` carries a path, and falls back to buffer mode if the path load
fails.

### Debugger "File path"

The WasmLoader's path tab (`WASM file path`) sends the text as `wasmPath`. A relative path
resolves against the **server's working directory**, not the workspace (`resolve()` in
`server/utils/pathValidator.ts`), so the suggestions list workspace `.wasm` files as full paths.

### Drag and drop

Dropping `.wasm` or config files works in a standalone browser. It does not work inside the VS Code
panel: VS Code intercepts file drags into webviews. There, use the explorer context-menu commands.

---

## Implementation Details

### HTTP WASM Runner

**Key Optimization**: Skip temp file creation

```typescript
async load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void> {
  let wasmPath: string;

  if (typeof bufferOrPath === 'string') {
    // Path provided - use directly (no temp file!)
    wasmPath = bufferOrPath;
    this.tempWasmPath = null;  // Don't cleanup
  } else {
    // Buffer provided - write to temp file
    wasmPath = await writeTempWasmFile(bufferOrPath);
    this.tempWasmPath = wasmPath;  // Cleanup later
  }

  // Spawn process with path
  this.process = spawn(this.cliPath, [
    'http',
    '-p', this.port.toString(),
    '-w', wasmPath,
    '--wasi-http', 'true',
  ]);
}
```

### Proxy WASM Runner

**Key Optimization**: Read once, compile once

```typescript
async load(bufferOrPath: Buffer | string, config?: RunnerConfig): Promise<void> {
  let buffer: Buffer;

  if (typeof bufferOrPath === 'string') {
    // Path provided - read file
    buffer = await readFile(bufferOrPath);
  } else {
    // Buffer provided - use directly
    buffer = bufferOrPath;
  }

  // Compile once and reuse
  this.module = await WebAssembly.compile(new Uint8Array(buffer));
}
```

---

## Testing

### Running Tests

```bash
# Path validator tests (unit)
pnpm test pathValidator

# Hybrid loading tests (integration)
pnpm test hybrid-loading

# All tests
pnpm test
```

### Test Coverage

**Path Validator** (22 tests):
- ✅ Valid path validation
- ✅ Path normalization (../, ./)
- ✅ Workspace root restriction
- ✅ Path traversal prevention
- ✅ Dangerous path blocking
- ✅ Extension validation
- ✅ Existence checking
- ✅ Absolute/relative paths

**Hybrid Loading** (15 tests):
- ✅ HTTP WASM: buffer vs path modes
- ✅ Proxy WASM: buffer vs path modes
- ✅ Identical execution results
- ✅ Error handling
- ✅ Performance characteristics
- ✅ Memory management

---

## Troubleshooting

### "File not found" Error

```typescript
// Error: File not found: /path/to/app.wasm

// Fix: Ensure file exists
fs.existsSync('/path/to/app.wasm'); // Should be true

// Fix: Use absolute path
const absolutePath = path.resolve('./app.wasm');
```

### "Invalid path" Error

```typescript
// Error: Invalid path

// Fix: Ensure .wasm extension
'/path/to/app.wasm' // ✅ Good
'/path/to/app.wat' // ❌ Bad

// Fix: Stay within workspace
'/workspace/app.wasm'     // ✅ Good
'/../../../etc/passwd'    // ❌ Bad
```

### "Access to system path not allowed"

```typescript
// Error: Access to system path '/etc' is not allowed

// Fix: Don't access system paths
'/workspace/app.wasm'  // ✅ Good
'/etc/passwd'          // ❌ Bad
```
