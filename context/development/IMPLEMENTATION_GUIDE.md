# Implementation Guide - Deep Dive

## How the Runner Works

### Full Flow with HTTP Fetch

```
React UI (browser)
  ↓ User selects .wasm file
  ↓ File.arrayBuffer() → btoa() → base64
  ↓ POST /api/load with {wasmBase64: "..."}
Server (Express)
  ↓ Buffer.from(wasmBase64, 'base64')
ProxyWasmRunner.load()
  ↓ WebAssembly.compile() → stores compiled module
  ↓ NO instantiation yet (deferred until hook execution)
Ready for requests

React UI (browser)
  ↓ User clicks "Send" button
  ↓ API: sendFullFlow(url, method, {request_headers, request_body, properties, logLevel})
  ↓ POST /api/send with {url, request: {headers, body, method}, properties, logLevel}
Server (Express) → ProxyWasmRunner.callFullFlow()

  ↓ PHASE 1: Request Hooks
  ↓ Run onRequestHeaders hook:
  ↓   → Create fresh WASM instance from compiled module
  ↓   → Initialize memory, run _start, run initialization hooks
  ↓   → WASM can modify headers via proxy_add_header_map_value, proxy_replace_header_map_value
  ↓   → HostFunctions captures modified headers
  ↓   → Clean up instance (isolated execution complete)
  ↓ Chain modified headers to next hook (CRITICAL: via data passing, not shared memory)
  ↓ Run onRequestBody hook with modified headers from onRequestHeaders:
  ↓   → Create NEW fresh WASM instance (isolated from previous hook)
  ↓   → Initialize memory, run _start, run initialization hooks
  ↓   → WASM can modify body via set_buffer_bytes
  ↓   → WASM can further modify headers
  ↓   → Clean up instance
  ↓ Capture modified headers and body from onRequestBody result

  ↓ PHASE 2: Real HTTP Fetch
  ↓ Detect binary content types (images, PDFs, etc.)
  ↓ Preserve host header as x-forwarded-host
  ↓ fetch(targetUrl, {method, headers: modifiedHeaders, body: modifiedBody})
  ↓ Read response:
  ↓   → Binary: Convert to base64, set isBase64 flag
  ↓   → Text: Read as string
  ↓ Extract response headers, status, contentType

  ↓ PHASE 3: Response Hooks
  ↓ Run onResponseHeaders with real response headers:
  ↓   → Create fresh WASM instance (isolated from request hooks)
  ↓   → Initialize memory, run _start, run initialization hooks
  ↓   → WASM can inspect/modify response headers
  ↓   → Clean up instance
  ↓ Run onResponseBody with real response body:
  ↓   → Create NEW fresh WASM instance (isolated from all previous hooks)
  ↓   → Initialize memory, run _start, run initialization hooks
  ↓   → WASM can inspect/modify response body
  ↓   → Clean up instance
  ↓ Capture final headers and body after WASM processing

  ↓ Return FullFlowResult:
  ↓   hookResults: {onRequestHeaders, onRequestBody, onResponseHeaders, onResponseBody}
  ↓   finalResponse: {status, headers, body, contentType, isBase64}

Server → React UI
  ↓ res.json({ok: true, hookResults: {...}, finalResponse: {...}})
  ↓ Frontend receives both hook logs and final response

React UI displays:
  ↓ HookStagesPanel shows logs/inputs for each hook
  ↓ ResponseViewer shows final response:
  ↓   → Body tab: Formatted JSON/HTML/XML
  ↓   → Preview tab: Rendered HTML or displayed image
  ↓   → Headers tab: Final response headers
```

### Individual Hook Execution (Manual Testing)

```
React UI
  ↓ User clicks individual hook button (e.g., "onRequestHeaders")
  ↓ API: callHook("onRequestHeaders", {request_headers, ...})
  ↓ POST /api/call with {hook, request, response, properties, logLevel}
Server (Express) → ProxyWasmRunner.callHook()
  ↓ Create fresh WASM instance from compiled module
  ↓ Initialize memory manager with new instance
  ↓ Setup: normalize headers, resolve properties, set log level
  ↓ Initialize: proxy_on_vm_start, proxy_on_configure (errors suppressed)
  ↓ Create context: proxy_on_context_create
  ↓ Execute single hook: proxy_on_request_headers(context_id, header_count, end_of_stream)
  ↓ Clean up instance (set to null)
  ↓ Return {returnCode, logs, input, output, properties}
React UI
  ↓ Display in HookStagesPanel for that specific hook
```

## WASM Instance Lifecycle (February 2026)

**Key Architecture Change:** Each hook executes in a completely isolated WASM instance.

### Compilation vs Instantiation

**Compilation (Expensive - Once per Load):**

```typescript
// In load():
this.module = await WebAssembly.compile(buffer);
// Validates code, optimizes, prepares for execution
// Takes ~50-200ms depending on binary size
```

**Instantiation (Cheap - Per Hook):**

```typescript
// In callHook() - happens 4 times per request:
this.instance = await WebAssembly.instantiate(this.module, imports);
// Creates fresh memory, links imports, ready to run
// Takes ~5-20ms per instantiation
```

### Why Isolated Instances?

1. **Production Parity**: Matches nginx + wasmtime behavior
   - Each hook runs in isolated context
   - No shared memory between hooks
   - State only passes via explicit data (headers, bodies)

2. **No State Leakage**:
   - Internal WASM variables reset between hooks
   - Memory allocations don't accumulate
   - Each hook starts with clean slate

3. **Catches Bugs**:
   - Tests code that assumes fresh state
   - Exposes issues with global variable assumptions
   - Validates proper use of property resolution

4. **Future-Ready**:
   - Foundation for loading different WASM modules per hook
   - Enables mixing multiple binaries in single request flow
   - Supports testing hook-specific implementations

### Instance Lifecycle per Hook

```typescript
1. callHook() invoked
2. Create imports object (host functions)
3. Instantiate module → fresh instance
4. Set memory manager with new memory
5. Initialize WASI
6. Call _start if exported
7. Run initialization hooks:
   - proxy_on_vm_start(root_context_id, vm_config_size)
   - proxy_on_plugin_start(root_context_id, plugin_config_size)
   - proxy_on_configure(root_context_id, plugin_config_size)
   - proxy_on_context_create(root_context_id, 0)
8. Create stream context:
   - proxy_on_context_create(stream_context_id, root_context_id)
9. Execute hook (onRequestHeaders, onRequestBody, etc.)
10. Capture output state
11. Clean up: this.instance = null
12. Return results
```

### Performance Characteristics

**Per Request (4 hooks):**

- Compilation: 0ms (already done in load())
- Instantiation: ~20-80ms total (4 × 5-20ms)
- Hook execution: ~10-50ms total
- **Total overhead: ~30-130ms for isolated execution**

**Trade-off:**

- Slower than shared instance (~10-20ms overhead)
- But: Accurate production simulation
- Worth it for: Catching state-related bugs

### Individual Hook Execution (Manual Testing)

```
React UI
  ↓ User clicks individual hook button (e.g., "onRequestHeaders")
  ↓ API: callHook("onRequestHeaders", {request_headers, ...})
  ↓ POST /api/call with {hook, request, response, properties, logLevel}
Server (Express) → ProxyWasmRunner.callHook()
  ↓ Setup: normalize headers, resolve properties, set log level
  ↓ Initialize (if first run): proxy_on_vm_start, proxy_on_configure (errors suppressed)
  ↓ Create context: proxy_on_context_create
  ↓ Execute single hook: proxy_on_request_headers(context_id, header_count, end_of_stream)
  ↓ Return {returnCode, logs, request, response, properties}
React UI
  ↓ Display in HookStagesPanel for that specific hook
```

### Memory Management

**WASM Memory Layout:**

```
[0 ... module memory ...]
[... allocated by WASM ...]
[hostAllocOffset] ← Host-controlled region starts here
[... host allocations ...]
[... grows as needed ...]
```

**Allocation Strategy:**

1. Try WASM's allocator first (proxy_on_memory_allocate or malloc)
2. If that returns 0 or fails, use host allocator
3. Host allocator grows memory in 64KB pages as needed

**Reading from WASM:**

```typescript
// Direct memory view
const bytes = new Uint8Array(memory.buffer, ptr, len);

// String decoding
const str = textDecoder.decode(bytes);
```

**Writing to WASM:**

```typescript
// Allocate space
const ptr = allocate(size);

// Write bytes
const view = new Uint8Array(memory.buffer, ptr, size);
view.set(dataBytes);

// Write U32 (little-endian)
const dataView = new DataView(memory.buffer);
dataView.setUint32(ptr, value, true);
```

### Host Function Implementation Pattern

Every host function follows this pattern:

```typescript
proxy_example_function: (
  arg1: number,
  arg2: number,
  ptrPtr: number,
  lenPtr: number,
) => {
  // 1. Log the call for debugging
  this.setLastHostCall(`proxy_example_function arg1=${arg1} arg2=${arg2}`);

  // 2. Read input data from WASM memory
  const inputData = this.memory.readString(arg1, arg2);

  // 3. Process/compute result
  const result = doSomething(inputData);

  // 4. Write result back to WASM memory
  this.memory.writeStringResult(result, ptrPtr, lenPtr);

  // 5. Return status code
  return ProxyStatus.Ok;
};
```

**Pointer-to-Pointer Pattern:**
When WASM wants a result:

- WASM allocates 8 bytes for [ptr: u32, len: u32]
- WASM passes address of this space
- Host writes pointer at ptrPtr, length at lenPtr
- WASM reads back and accesses the data

### Header Serialization Details

**Why the specific format?**
The G-Core SDK's `deserializeHeaders()` function expects:

1. First u32 tells it how many pairs to expect
2. Size array lets it pre-calculate offsets
3. Null terminators allow direct ArrayBuffer slicing

**Deserialization Process (SDK side):**

```typescript
function deserializeHeaders(headers: ArrayBuffer): Headers {
  // Read count
  let numheaders = Uint32Array.wrap(headers, 0, 1)[0];

  // Read size array
  let sizes = Uint32Array.wrap(headers, 4, 2 * numheaders);

  // Read data section (after size array)
  let data = headers.slice(4 + 8 * numheaders);

  let result: Headers = [];
  let dataIndex = 0;

  for (let i = 0; i < numheaders; i++) {
    let keySize = sizes[i * 2];
    let valueSize = sizes[i * 2 + 1];

    let key = data.slice(dataIndex, dataIndex + keySize);
    dataIndex += keySize + 1; // +1 for null terminator

    let value = data.slice(dataIndex, dataIndex + valueSize);
    dataIndex += valueSize + 1; // +1 for null terminator

    result.push(new HeaderPair(key, value));
  }

  return result;
}
```

### Property Resolution

**Resolution Order (Priority):**

1. Check user-provided properties (highest priority - from ServerPropertiesPanel or API)
2. Check runtime-calculated properties (from URL extraction)
3. Check standard properties (request._, response._)
4. Try path segment resolution (nested objects)
5. Return undefined if not found

**Property Chaining Between Hooks:**

Properties flow through the pipeline just like headers and bodies:

```
1. Extract runtime properties from target URL (before any hooks)
2. Merge with user properties (user overrides calculated)
3. onRequestHeaders modifies properties → pass to onRequestBody
4. onRequestBody modifies properties → pass to response hooks
5. onResponseHeaders modifies properties → pass to onResponseBody
6. All properties visible in UI Inputs/Outputs tabs with diffs
```

**URL Reconstruction:**

Modified properties affect actual HTTP requests:

```typescript
// WASM can redirect by modifying properties
Host.setProperty("request.path", "/400"); // Changes /200 to /400
Host.setProperty("request.host", "example.com");
Host.setProperty("request.scheme", "http");

// Server reconstructs URL from modified properties
const actualUrl = `${scheme}://${host}${path}${query ? "?" + query : ""}`;
// HTTP fetch goes to reconstructed URL
```

**Path Normalization:**

```
"request.method"          → request.method
"request\0method"         → request.method
"request/method"          → request.method
```

All resolve to the same property.

**Standard Properties:**

```typescript
// Request (runtime-calculated from URL)
"request.url"         → Full URL
"request.host"        → Hostname with port (from URL or headers)
"request.path"        → Path from URL (e.g., "/200")
"request.query"       → Query string (e.g., "param=value")
"request.scheme"      → Protocol (http/https)
"request.extension"   → File extension from path
"request.method"      → HTTP method

// Request (user-provided, can override calculated)
"request.country"     → Custom geo property
"request.city"        → Custom geo property
... any custom properties ...

// Response (available after HTTP fetch)
"response.code"       → Status code
"response.status"     → Same as response.code
"response.code_details" → Status text

// Header access via properties
"request.headers.content-type"  → Request header value
"response.headers.server"       → Response header value
```

**getAllProperties() Method:**

Returns merged view respecting priority:

```typescript
getAllProperties(): Record<string, unknown> {
  const calculated = this.getCalculatedProperties();
  return { ...calculated, ...this.properties };  // User overrides
}
```

### WASI Integration

**Why WASI?**
To capture `fd_write` calls (stdout/stderr) made by WASM.

**Implementation:**

```typescript
const wasi = new WASI({ version: "preview1" });

// Override fd_write to capture output
fd_write: (fd: number, iovs: number, iovsLen: number, nwritten: number) => {
  // 1. Capture to logs
  const captured = this.memory.captureFdWrite(fd, iovs, iovsLen, nwritten);

  // 2. Also call original WASI implementation
  const original = wasiImport.fd_write;
  if (typeof original === "function") {
    try {
      return original(fd, iovs, iovsLen, nwritten);
    } catch (error) {
      // Log but don't fail
    }
  }

  // 3. Write byte count back to WASM
  if (nwritten) {
    this.memory.writeU32(nwritten, captured);
  }

  return 0;
};
```

**IOVec Structure:**

```
[iovec0: {buf_ptr: u32, buf_len: u32}]  @ iovs + 0
[iovec1: {buf_ptr: u32, buf_len: u32}]  @ iovs + 8
[iovec2: {buf_ptr: u32, buf_len: u32}]  @ iovs + 16
...
```

Each iovec points to a buffer in WASM memory. We read all of them and concatenate.

## Binary Content Handling

### Detection

Binary content is detected by content-type:

```typescript
const isBinary =
  contentType.startsWith("image/") ||
  contentType.startsWith("video/") ||
  contentType.startsWith("audio/") ||
  contentType.includes("application/octet-stream") ||
  contentType.includes("application/pdf") ||
  contentType.includes("application/zip");
```

### Backend Processing

Binary responses are converted to base64:

```typescript
if (isBinary) {
  const arrayBuffer = await response.arrayBuffer();
  responseBody = Buffer.from(arrayBuffer).toString("base64");
  isBase64 = true;
} else {
  responseBody = await response.text();
}
```

### Frontend Display

**Images:**

```typescript
<img src={`data:${contentType};base64,${body}`} />
```

**HTML:**

```typescript
<iframe srcDoc={body} sandbox="allow-same-origin" />
```

**Non-displayable binary:**
Show message, hide Body tab, only show Headers tab.

### Tab Visibility Logic

- **Body tab**: Hidden for binary content (images, PDFs, etc.)
- **Preview tab**: Shown only for HTML and images
- **Headers tab**: Always shown

### Auto Tab Selection

- HTML/Images → Preview tab
- Binary non-image → Headers tab
- Text (JSON, XML, plain) → Body tab

## Hook State Chaining

**Critical Implementation Detail (Fixed Jan 29, 2026)**

Each hook must receive the accumulated modifications from previous hooks, not the original input state.

**Before (Broken):**

```typescript
results.onRequestHeaders = await this.callHook({
  ...call,
  hook: "onRequestHeaders",
});
results.onRequestBody = await this.callHook({ ...call, hook: "onRequestBody" });
// ❌ Both hooks receive original headers - modifications lost!
```

**After (Fixed):**

```typescript
results.onRequestHeaders = await this.callHook({
  ...call,
  hook: "onRequestHeaders",
});

// Pass modified headers to next hook
const headersAfterRequestHeaders = results.onRequestHeaders.request.headers;

results.onRequestBody = await this.callHook({
  ...call,
  request: {
    ...call.request,
    headers: headersAfterRequestHeaders, // ✅ Use modified headers
  },
  hook: "onRequestBody",
});

// Final state includes all modifications
const modifiedRequestHeaders = results.onRequestBody.request.headers;
const modifiedRequestBody = results.onRequestBody.request.body;
```

**Why This Matters:**

- WASM modifies headers in `onRequestHeaders` (e.g., adds authentication, custom headers)
- Those modifications must be visible to `onRequestBody`
- Final modifications must be applied to the actual HTTP fetch
- Without chaining, WASM modifications are ignored

**Same Pattern for Response Hooks:**

```typescript
results.onResponseHeaders = await this.callHook({
  ...responseCall,
  hook: "onResponseHeaders",
});

const headersAfterResponseHeaders = results.onResponseHeaders.response.headers;

results.onResponseBody = await this.callHook({
  ...responseCall,
  response: {
    ...responseCall.response,
    headers: headersAfterResponseHeaders,
  },
  hook: "onResponseBody",
});
```

## Environment Variables and Configuration (February 2026)

### DotEnv Integration

The runner supports loading secrets and dictionary values from `.env` files:

**Files Supported:**
- `.env` - Combined file with `FASTEDGE_VAR_SECRET_` and `FASTEDGE_VAR_ENV_` prefixes
- `.env.secrets` - Secrets only (no prefix needed)
- `.env.variables` - Dictionary values only (no prefix needed)

**Architecture:**
- `server/utils/dotenv-loader.ts` - File parsing and loading
- `server/fastedge-host/SecretStore.ts` - Secret storage with time-based rotation
- `server/fastedge-host/Dictionary.ts` - Key-value configuration store
- `server/runner/ProxyWasmRunner.ts` - Integration point (loadDotenvIfEnabled)

**WASM Access:**
- Secrets: `proxy_get_secret("SECRET_NAME")` host function
- Dictionary: `proxy_dictionary_get("KEY_NAME")` host function

**Default Behavior:**
- Dotenv loading is enabled by default when loading WASM
- Can be disabled via `POST /api/load` with `{"dotenvEnabled": false}`
- Missing files are silently ignored (no errors)
- Values merge with any programmatically configured FastEdge config

See [DOTENV.md](./DOTENV.md) for complete usage guide.

## Module Dependencies

### ProxyWasmRunner.ts

- Imports: MemoryManager, HeaderManager, PropertyResolver, HostFunctions, SecretStore, Dictionary, dotenv-loader
- Exports: ProxyWasmRunner class
- Role: Orchestrates the entire lifecycle including dotenv loading

### HostFunctions.ts

- Imports: MemoryManager, HeaderManager, PropertyResolver, SecretStore, Dictionary, types
- Exports: HostFunctions class
- Role: Implements proxy-wasm ABI host functions including FastEdge extensions

### HeaderManager.ts

- Imports: types
- Exports: HeaderManager class (static methods)
- Role: Serialize/deserialize headers in Kong SDK format

### MemoryManager.ts

- Imports: none
- Exports: MemoryManager class
- Role: Low-level WASM memory operations

### PropertyResolver.ts

- Imports: types
- Exports: PropertyResolver class
- Role: Resolve property paths to values

### types.ts

- Imports: none
- Exports: TypeScript types and enums
- Role: Shared type definitions

**Dependency Graph:**

```
ProxyWasmRunner
  ├─→ MemoryManager
  ├─→ HeaderManager ─→ types
  ├─→ PropertyResolver ─→ types
  └─→ HostFunctions
       ├─→ MemoryManager
       ├─→ HeaderManager
       ├─→ PropertyResolver
       └─→ types
```

## Adding New Host Functions

**Step 1: Add to HostFunctions.ts**

```typescript
proxy_your_function: (
  arg1: number,
  arg2: number,
  resultPtrPtr: number,
  resultLenPtr: number,
) => {
  this.setLastHostCall(`proxy_your_function arg1=${arg1} arg2=${arg2}`);

  // Your implementation
  const result = "computed value";

  this.memory.writeStringResult(result, resultPtrPtr, resultLenPtr);
  return ProxyStatus.Ok;
};
```

**Step 2: Add to imports in createImports()**

```typescript
return {
  env: {
    // ... existing functions
    proxy_your_function: this.functions.proxy_your_function,
  },
};
```

**Step 3: Test with WASM that uses it**

## Adding New Properties

**Step 1: Add to PropertyResolver.resolveStandard()**

```typescript
private resolveStandard(path: string): unknown {
  const normalizedPath = path.replace(/\0/g, ".");

  // Your new property
  if (normalizedPath === "your.property") {
    return this.computeValue();
  }

  // ... existing properties
}
```

**Step 2: Add any needed state to PropertyResolver**

```typescript
private yourValue: string = "";

setYourValue(value: string): void {
  this.yourValue = value;
}
```

**Step 3: Wire it up in ProxyWasmRunner.callHook()**

```typescript
this.propertyResolver.setYourValue(call.yourValue ?? "default");
```

## Testing Strategy

### Manual Testing

1. Load basic-wasm-code.md → verify hooks execute
2. Load print-wasm-code.md → verify headers parse
3. Test each hook individually
4. Test "Run All Hooks" flow
5. Verify logs appear correctly
6. Test with various header combinations

### Debug Techniques

1. Enable debug mode: `PROXY_RUNNER_DEBUG=1`
2. Check hex dumps of serialized data
3. Add temporary logs in specific functions
4. Use browser dev tools for frontend debugging
5. Check terminal for server-side errors

### Common Test Cases

```javascript
// Empty headers
{}

// Single header
{"host": "example.com"}

// Multiple headers
{"host": "example.com", "content-type": "application/json", "x-trace-id": "abc123"}

// Headers with special characters
{"x-custom": "value with spaces", "x-unicode": "émojis 🎉"}

// Case variations (should normalize)
{"Host": "example.com", "Content-Type": "text/plain"}
```

## Performance Considerations

### Current Performance

- Binary loading: ~100ms for small binaries
- Hook execution: ~10-50ms per hook
- Memory allocation: minimal overhead
- No significant bottlenecks for testing

### Optimization Opportunities

1. Cache compiled WebAssembly modules
2. Reuse WASM instances for multiple calls
3. Pool memory managers
4. Batch multiple hook calls

### Memory Usage

- Each loaded binary: ~500KB - 2MB
- Runtime overhead: ~5-10MB
- Grows with: number of headers, body size, property count

## Security Considerations

### Current Security

- Runs locally only (localhost:5179 or 127.0.0.1:5179)
- No authentication/authorization
- No rate limiting
- No input validation on file upload

### For Production Use

Would need:

1. Authentication
2. Rate limiting
3. Input validation (WASM signature check)
4. Resource limits (memory, execution time)
5. Sandboxing
6. HTTPS
7. CORS configuration

**Note:** This is a development tool, not intended for production deployment.

## Troubleshooting Guide

### "Module not loaded" error

- Ensure you clicked "Load" and saw "Loaded successfully"
- Check browser console for errors
- Verify WASM file is valid (not corrupted)

### Headers not appearing in output

- Check debug logs for `proxy_get_header_map_pairs`
- Verify hex dump shows correct format
- Ensure WASM is calling the host function

### Unexpected return code

- Check logs for what WASM executed
- Verify input data matches expectations
- Look for trap/error messages in logs

### "unreachable" trap

- Usually in initialization (vm_start, configure)
- Often non-critical if hooks still work
- Check which host function failed
- Add missing host functions if needed

### Response headers not modified by WASM

- Fixed Jan 29, 2026: MapType enum had wrong values
- Ensure MapType.ResponseHeaders = 2 (not 1)
- Check debug logs for `proxy_add_header_map_value map=2`
- Verify headers appear in `onResponseHeaders` hook results

## Type System and Enums

### MapType Enum (Fixed Jan 29, 2026)

**Critical Bug Fix**: The MapType enum values must match the proxy-wasm specification exactly.

```typescript
export enum MapType {
  RequestHeaders = 0,
  RequestTrailers = 1,
  ResponseHeaders = 2, // Was incorrectly 1 before fix
  ResponseTrailers = 3, // Added in fix
}
```

**Bug Impact**: Before the fix, when WASM called `proxy_add_header_map_value` with `mapType=2` (response headers), our code treated it as request headers because `ResponseHeaders = 1`. This caused all response header modifications to be lost.

**Usage in Host Functions:**

```typescript
private getHeaderMap(mapType: number): HeaderMap {
  if (mapType === MapType.ResponseHeaders || mapType === MapType.ResponseTrailers) {
    return this.responseHeaders;
  }
  return this.requestHeaders;
}

private setHeaderMap(mapType: number, map: HeaderMap): void {
  if (mapType === MapType.ResponseHeaders || mapType === MapType.ResponseTrailers) {
    this.responseHeaders = HeaderManager.normalize(map);
  } else {
    this.requestHeaders = HeaderManager.normalize(map);
  }
}
```

### Other Enums

**ProxyStatus:**

```typescript
export enum ProxyStatus {
  Ok = 0,
  NotFound = 1,
  BadArgument = 2,
  SerializationFailure = 7,
  InternalFailure = 10,
}
```

**BufferType:**

```typescript
export enum BufferType {
  HttpRequestBody = 0,
  HttpResponseBody = 1,
  VmConfiguration = 2,
  PluginConfiguration = 3,
}
```

## Hook State Chaining

**Critical Implementation Detail (Fixed Jan 29, 2026)**

Each hook must receive the accumulated modifications from previous hooks, not the original input state.

**Before (Broken):**

```typescript
results.onRequestHeaders = await this.callHook({
  ...call,
  hook: "onRequestHeaders",
});
results.onRequestBody = await this.callHook({ ...call, hook: "onRequestBody" });
// ❌ Both hooks receive original headers - modifications lost!
```

**After (Fixed):**

```typescript
results.onRequestHeaders = await this.callHook({
  ...call,
  hook: "onRequestHeaders",
});

// Pass modified headers to next hook
const headersAfterRequestHeaders = results.onRequestHeaders.request.headers;

results.onRequestBody = await this.callHook({
  ...call,
  request: {
    ...call.request,
    headers: headersAfterRequestHeaders, // ✅ Use modified headers
  },
  hook: "onRequestBody",
});

// Final state includes all modifications
const modifiedRequestHeaders = results.onRequestBody.request.headers;
const modifiedRequestBody = results.onRequestBody.request.body;
```

**Why This Matters:**

- WASM modifies headers in `onRequestHeaders` (e.g., adds authentication, custom headers)
- Those modifications must be visible to `onRequestBody`
- Final modifications must be applied to the actual HTTP fetch
- Without chaining, WASM modifications are ignored

**Same Pattern for Response Hooks:**

```typescript
results.onResponseHeaders = await this.callHook({
  ...responseCall,
  hook: "onResponseHeaders",
});

const headersAfterResponseHeaders = results.onResponseHeaders.response.headers;

results.onResponseBody = await this.callHook({
  ...responseCall,
  response: {
    ...responseCall.response,
    headers: headersAfterResponseHeaders,
  },
  hook: "onResponseBody",
});
```

### Memory errors

- Check available memory
- Verify allocations aren't too large
- Look for pointer arithmetic errors
- Ensure proper little-endian byte order

## Testing

### When to Write Tests

Tests should be written for:

1. **New Features**: Write tests alongside feature implementation
   - Define test cases before writing code (TDD approach recommended)
   - Cover happy path, edge cases, and error scenarios
   - Ensure all exported functions/components have tests

2. **Bug Fixes**: Write a failing test first, then fix the bug
   - The test should fail before the fix
   - The test should pass after the fix
   - Prevents regression of the same bug

3. **Refactoring**: Ensure existing tests pass after refactoring
   - Run tests before refactoring (establish baseline)
   - Tests should pass without modification after refactoring
   - Add new tests if behavior changes

4. **Public APIs**: All exported functions, classes, and components must have tests
   - Backend: Exported functions from server/runner/, server/utils/
   - Frontend: All components, hooks, and utility functions

### What to Test

**Must Test**:
- Public APIs and exported functions
- User interactions (clicks, typing, form submission)
- State changes and side effects
- Error handling and validation
- Edge cases (empty input, null, undefined, large values)
- Async operations (loading states, success, failure)

**Optional**:
- Internal helper functions (if complex)
- Performance-critical paths (benchmarks)
- Integration between modules

**Don't Test**:
- Type definitions alone
- Third-party libraries
- Trivial getters/setters
- Framework internals

### Testing Workflow

1. **Before Implementation**:
   ```bash
   # Create test file alongside implementation
   touch server/utils/my-feature.ts
   touch server/utils/my-feature.test.ts
   ```

2. **During Implementation**:
   ```bash
   # Run tests in watch mode
   vitest watch server/utils/my-feature.test.ts
   ```

3. **Before Committing**:
   ```bash
   # Run all tests
   pnpm test

   # Check coverage
   vitest run --coverage
   ```

### Test Coverage Goals

- **Utilities**: 90%+ coverage (pure functions are straightforward to test)
- **Components**: 80%+ coverage (focus on user interactions)
- **Hooks**: 85%+ coverage (test all state transitions)
- **Integration**: 70%+ coverage (focus on critical flows)

### Testing Resources

- **Patterns and Examples**: See [TEST_PATTERNS.md](./TEST_PATTERNS.md)
- **Running Tests**: See [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- **Current Test Suite**: 388 tests across backend and frontend
  - Backend: 198 tests (dotenv-loader, HeaderManager, PropertyResolver)
  - Frontend: 190 tests (components, hooks, utilities)

## Extension Points

### Custom Header Formats

If you need a different header format:

1. Modify `HeaderManager.serialize()`
2. Ensure it matches your SDK's `deserializeHeaders()`
3. Test with real binaries

**Note**: The G-Core SDK uses the same format as the previous Kong SDK, so no changes are needed for G-Core binaries.

### Additional Hooks

To support more hooks:

1. Add case in `buildHookInvocation()`
2. Add button in UI (index.html)
3. Add handler in app.js

### Custom Properties

To add domain-specific properties:

1. Extend `PropertyResolver.resolveStandard()`
2. Add UI fields if needed
3. Document the property path

### External Data Sources

To load properties from external sources:

1. Add async methods to PropertyResolver
2. Call during initialization in ProxyWasmRunner
3. Cache results for performance

Last Updated: February 6, 2026
