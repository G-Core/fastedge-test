# CDN Properties Test Applications

This directory contains AssemblyScript test applications for validating property access control in the Proxy-WASM runner.

## Purpose

These test applications are compiled to WASM and used in integration tests (`server/__tests__/integration/property-access/`) to ensure production parity with FastEdge CDN property access rules.

## Test Applications

### Read-Write Properties (Valid Cases)

#### `valid-path-write.ts`
- **Tests**: Writing to `request.path` in `onRequestHeaders`
- **Expected**: ✅ Write succeeds
- **Coverage**: ReadWrite property write in onRequestHeaders hook

#### `valid-url-write.ts`
- **Tests**: Writing to `request.url` in `onRequestHeaders`
- **Expected**: ✅ Write succeeds
- **Coverage**: ReadWrite property write in onRequestHeaders hook

#### `valid-host-write.ts`
- **Tests**: Writing to `request.host` in `onRequestHeaders`
- **Expected**: ✅ Write succeeds
- **Coverage**: ReadWrite property write in onRequestHeaders hook

#### `valid-query-write.ts`
- **Tests**: Writing to `request.query` in `onRequestHeaders`
- **Expected**: ✅ Write succeeds
- **Coverage**: ReadWrite property write in onRequestHeaders hook

### Read-Only Properties (Invalid Cases)

#### `invalid-method-write.ts`
- **Tests**: Attempting to write to `request.method` in `onRequestHeaders`
- **Expected**: ❌ Write denied (read-only)
- **Coverage**: ReadOnly property write denial

#### `invalid-scheme-write.ts`
- **Tests**: Attempting to write to `request.scheme` in `onRequestHeaders`
- **Expected**: ❌ Write denied (read-only)
- **Coverage**: ReadOnly property write denial

#### `invalid-geolocation-write.ts`
- **Tests**: Attempting to write to `request.country` in `onRequestHeaders`
- **Expected**: ❌ Write denied (read-only geolocation)
- **Coverage**: ReadOnly geolocation property write denial

#### `valid-readonly-read.ts`
- **Tests**: Reading all 8 read-only properties in `onRequestHeaders`
  - `request.extension`, `request.city`, `request.asn`
  - `request.geo.lat`, `request.geo.long`
  - `request.region`, `request.continent`, `request.country.name`
- **Expected**: ✅ All reads succeed
- **Coverage**: Comprehensive read-only property access verification

#### `invalid-readonly-write.ts`
- **Tests**: Attempting to write to all 8 read-only properties in `onRequestHeaders`
  - Same properties as `valid-readonly-read.ts`
- **Expected**: ❌ All writes denied (read-only)
- **Coverage**: Comprehensive read-only property write denial verification

### Response Properties

#### `valid-response-status-read.ts`
- **Tests**: Reading `response.status` in `onResponseHeaders`
- **Expected**: ✅ Read succeeds
- **Coverage**: Response property read in onResponseHeaders hook

#### `invalid-response-status-write.ts`
- **Tests**: Attempting to write to `response.status` in `onResponseHeaders`
- **Expected**: ❌ Write denied (read-only)
- **Coverage**: Response property write denial

### Write-Only Properties

#### `valid-nginx-log-write.ts`
- **Tests**: Writing to `nginx.log_field1` in `onRequestHeaders`
- **Expected**: ✅ Write succeeds (write-only)
- **Coverage**: Write-only property access

## Building

Build all test applications:

```bash
pnpm build:test-apps
```

This compiles all `.ts` files to `.wasm` binaries in `wasm/cdn-apps/properties/`.

## Integration Tests

The compiled WASM binaries are loaded in integration tests:

- **Location**: `server/__tests__/integration/property-access/`
- **Test Files**:
  - `read-write-properties.test.ts` - Tests for ReadWrite properties
  - `read-only-properties.test.ts` - Tests for ReadOnly properties
  - `all-readonly-properties.test.ts` - Comprehensive tests for all read-only properties
  - `response-properties.test.ts` - Tests for response properties
  - `nginx-properties.test.ts` - Tests for nginx properties
  - `cross-hook-access.test.ts` - Tests for cross-hook access patterns

Run integration tests:

```bash
pnpm test:integration
```

## Property Coverage

### Tested Properties

| Property | Type | Hook | Test App | Status |
|----------|------|------|----------|--------|
| `request.path` | ReadWrite | onRequestHeaders | `valid-path-write` | ✅ Tested |
| `request.url` | ReadWrite | onRequestHeaders | `valid-url-write` | ✅ Tested |
| `request.host` | ReadWrite | onRequestHeaders | `valid-host-write` | ✅ Tested |
| `request.query` | ReadWrite | onRequestHeaders | `valid-query-write` | ✅ Tested |
| `request.method` | ReadOnly | onRequestHeaders | `invalid-method-write` | ✅ Tested |
| `request.scheme` | ReadOnly | onRequestHeaders | `invalid-scheme-write` | ✅ Tested |
| `request.country` | ReadOnly | onRequestHeaders | `invalid-geolocation-write` | ✅ Tested |
| `request.extension` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `request.city` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `request.asn` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `request.geo.lat` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `request.geo.long` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `request.region` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `request.continent` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `request.country.name` | ReadOnly | onRequestHeaders | `valid-readonly-read`, `invalid-readonly-write` | ✅ Tested |
| `response.status` | ReadOnly | onResponseHeaders | `valid-response-status-read`, `invalid-response-status-write` | ✅ Tested |
| `nginx.log_field1` | WriteOnly | onRequestHeaders | `valid-nginx-log-write` | ✅ Tested |

**Coverage Summary**: 17/17 built-in properties tested (100% coverage) ✅

### Future Work

**Hook Coverage Expansion**:
- Additional tests for `onRequestBody` and `onResponseBody` hooks
- Custom properties with context isolation

## Adding New Test Applications

1. **Create TypeScript file** in `assembly/`:
   ```typescript
   // assembly/my-test-app.ts
   export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
   import { Context, RootContext, /* ... */ } from "@gcoredev/proxy-wasm-sdk-as/assembly";

   class MyTestRoot extends RootContext {
     createContext(context_id: u32): Context {
       return new MyTestContext(context_id, this);
     }
   }

   class MyTestContext extends Context {
     onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
       // Test logic here
       return FilterHeadersStatusValues.Continue;
     }
   }

   registerRootContext((context_id: u32) => {
     return new MyTestRoot(context_id);
   }, "httpProperties");
   ```

2. **Add build scripts** to `package.json`:
   ```json
   {
     "build:all": "npm-run-all -p ... build:my-test-app",
     "build:my-test-app": "asc assembly/my-test-app.ts --target release --outFile build/my-test-app.wasm --textFile build/my-test-app.wat --sourceMap --optimize",
     "copy:all": "npm-run-all -p ... copy:my-test-app",
     "copy:my-test-app": "mv build/my-test-app.wasm ../../../wasm/cdn-apps/properties/my-test-app.wasm"
   }
   ```

3. **Add constant** to `server/__tests__/integration/utils/wasm-loader.ts`:
   ```typescript
   export const WASM_TEST_BINARIES = {
     cdnApps: {
       properties: {
         // ...
         myTestApp: 'my-test-app.wasm',
       },
     },
   };
   ```

4. **Create integration test** in appropriate file under `server/__tests__/integration/property-access/`

5. **Build and test**:
   ```bash
   pnpm build:test-apps
   pnpm test:integration
   ```

## Architecture

Each test application follows the same pattern:

1. **RootContext** - Creates context instances
2. **Context** - Implements hook logic
3. **Hook Implementation** - Tests specific property access
4. **Logging** - Logs property values for verification

The runner enforces production property access rules and logs violations, which are validated in integration tests.
