# Testing Guide

## Automated Testing

This project uses [Vitest](https://vitest.dev/) as the test framework along with [Testing Library](https://testing-library.com/) for component testing. The test suite is split between backend (Node.js) and frontend (React) tests with separate configurations and coverage tracking.

### Test Infrastructure

- **Test Framework**: Vitest
- **Component Testing**: React Testing Library + jsdom
- **Backend Testing**: Vitest with Node environment
- **Mocking**: Vitest's built-in mocking system (`vi.mock()`, `vi.fn()`)
- **Coverage**: V8 provider with text, JSON, and HTML reporters

### Running Tests

```bash
# Run all tests (backend + frontend)
pnpm test

# Run backend tests only
pnpm test:backend

# Run frontend tests only
pnpm test:frontend

# Watch mode (re-run on file changes)
vitest watch                    # All tests
vitest watch server/**/*.test.ts  # Backend only
cd frontend && vitest watch      # Frontend only

# Coverage report
vitest run --coverage           # All tests with coverage
cd frontend && vitest run --coverage  # Frontend coverage only

# UI mode (interactive test runner)
vitest --ui                     # Visual test interface
```

### Test Organization

All backend tests are co-located under `server/__tests__/`, split into `unit/` and `integration/` subdirectories. This mirrors the source structure but keeps tests separate from implementation files.

```
proxy-runner/
├── server/
│   └── __tests__/              # All backend tests live here
│       ├── unit/               # Unit tests (vitest.config.ts: include server/__tests__/unit/**/*.test.ts)
│       │   ├── runner/
│       │   │   ├── HeaderManager.test.ts
│       │   │   ├── PropertyResolver.test.ts
│       │   │   ├── PropertyAccessControl.test.ts
│       │   │   └── standalone.test.ts
│       │   └── utils/
│       │       ├── dotenv-loader.test.ts
│       │       └── pathValidator.test.ts
│       └── integration/        # Integration tests (separate vitest config)
│           ├── cdn-apps/
│           │   ├── full-flow/
│           │   │   └── headers-change-with-downstream.test.ts
│           │   └── property-access/
│           │       ├── read-only-properties.test.ts
│           │       ├── read-write-properties.test.ts
│           │       ├── nginx-properties.test.ts
│           │       ├── response-properties.test.ts
│           │       ├── cross-hook-access.test.ts
│           │       └── all-readonly-properties.test.ts
│           ├── http-apps/
│           │   ├── sdk-basic/basic-execution.test.ts
│           │   └── sdk-downstream-modify/downstream-modify-response.test.ts
│           ├── hybrid-loading.test.ts
│           └── utils/          # Shared test helpers (not test files)
│               ├── test-helpers.ts
│               ├── property-assertions.ts
│               ├── http-wasm-helpers.ts
│               └── wasm-loader.ts
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Toggle/Toggle.test.tsx
│       │   ├── DictionaryInput/DictionaryInput.test.tsx
│       │   └── CollapsiblePanel/CollapsiblePanel.test.tsx
│       ├── hooks/
│       │   └── useWasm.test.ts
│       └── utils/
│           ├── contentType.test.ts
│           └── diff.test.ts
└── vitest.config.ts           # Backend unit test config (include: server/__tests__/unit/**)
    frontend/vitest.config.ts  # Frontend config
```

**Key convention**: Tests are NOT co-located next to source files. All tests live under `server/__tests__/unit/` or `server/__tests__/integration/`, mirroring the source structure (e.g., `server/runner/HeaderManager.ts` → `server/__tests__/unit/runner/HeaderManager.test.ts`).

### Test Patterns and Best Practices

See [TEST_PATTERNS.md](./TEST_PATTERNS.md) for detailed testing patterns, examples, and best practices.

### Test Coverage

Coverage reports are generated in:
- Backend: `coverage/` (root directory)
- Frontend: `frontend/coverage/`

View HTML reports by opening:
- `coverage/index.html`
- `frontend/coverage/index.html`

---

## Manual Testing - Change-Header WASM Quick Start

### Current Setup

You have the `cdn_header_change.wasm` binary in your `/wasm` folder and a test configuration system ready to use.

## Step 1: Start the Application

### Option A: Development Mode (with hot reload)

```bash
# Terminal 1: Backend server
pnpm dev:backend

# Terminal 2: Frontend dev server
pnpm dev:frontend

# Access at: http://localhost:5173 (frontend dev server)
# Backend runs on: http://localhost:5179
```

### Option B: Production Mode

```bash
# Build and run
pnpm build
pnpm start

# Access at: http://localhost:5179
```

## Step 2: Using the UI

### Load WASM Binary

1. Open the application in your browser
2. Click the file input under "Load WASM Binary"
3. Select `wasm/cdn_header_change.wasm`
4. Wait for "Loading..." to complete

### Configure Test Settings

The default config in `fastedge-config.test.json` is set up for the change-header WASM:

- **Method**: POST
- **URL**: https://www.godronus.xyz/200
- **Headers**: (commented out by default - uncomment to test body injection)
  - `x-inject-req-body`: Injected WASM value onRequestBody
  - `x-inject-res-body`: Injected WASM value onResponseBody
- **Body**: `{"message": "Hello"}`
- **Properties**: Includes geo properties (country: LU, city: Luxembourg, etc.)
- **Log Level**: 0 (Trace - shows all logs)

### Load Configuration

Click the **"📥 Load Config"** button to load these settings into the UI.

### Send Request

Click the **"Send"** button to execute the full request flow through all hooks.

### View Results

- **Hooks Panel**: See logs and execution for each hook
  - `onRequestHeaders` - Injects `x-custom-request` header
  - `onRequestBody` - Injects field into request body JSON
  - `onResponseHeaders` - Injects `x-custom-response` header
  - `onResponseBody` - Injects field into response body JSON

- **Response Panel**: See the final response with all modifications

### Save Modified Configuration

After making changes in the UI, click **"💾 Save Config"** to save your settings.

## Step 3: Testing with AI Agent

### Scenario: Test with Different Properties

**Your prompt to AI:**

> "Load the test config and run the change-header WASM test three times with these countries: Luxembourg, Germany, and France. Show me what headers were injected in each case."

**What the AI will do:**

1. Read `fastedge-config.test.json` via GET `/api/config`
2. Load WASM: `wasm/cdn_header_change.wasm`
3. For each country:
   - Use base config settings
   - Override `request.country` property
   - Send request via POST `/api/send`
   - Capture injected headers from results

4. Report comparison of results

### Scenario: Test Body Modification

**Your prompt to AI:**

> "Using the current config, test if the WASM properly injects the x-inject-req-body value into request body. Try with these JSON bodies: empty object, simple message, and nested object."

**What the AI will do:**

1. Read base config
2. Loop through 3 test cases:
   - `{}`
   - `{"message": "test"}`
   - `{"user": {"name": "test", "id": 123}}`
3. Compare request body before and after WASM processing
4. Report if injection worked correctly

## Expected WASM Behavior

Based on the `change-header-code.md` context, this WASM does:

### onRequestHeaders Hook

- Injects header: `x-custom-request: "I am injected from onRequestHeaders"`
- If `x-inject-req-body` header exists and content-type is JSON:
  - Removes `content-length` header (body will be modified)

### onRequestBody Hook

- If `x-inject-req-body` header exists and content-type is JSON:
  - Reads current request body
  - Injects field `x-inject-req-body` with header value into JSON
  - Updates request body with modified JSON

### onResponseHeaders Hook

- Injects header: `x-custom-response: "I am injected from onResponseHeaders"`
- If `x-inject-res-body` header exists and content-type is JSON:
  - Removes `content-length` header (body will be modified)

### onResponseBody Hook

- If `x-inject-res-body` header exists and content-type is JSON:
  - Reads current response body
  - Injects field `x-inject-res-body` with header value into JSON
  - Updates response body with modified JSON

## Verification Steps

### 1. Check Request Header Injection

In the Hooks Panel, expand `onRequestHeaders` and check:

- Output headers should contain: `x-custom-request`

### 2. Check Request Body Modification

In the Hooks Panel, expand `onRequestBody`:

- Input body: `{"message": "Hello"}`
- Output body: `{"message": "Hello", "x-inject-req-body": "Injected WASM value onRequestBody"}`

### 3. Check Response Header Injection

In the Hooks Panel, expand `onResponseHeaders`:

- Output headers should contain: `x-custom-response`

### 4. Check Response Body Modification

In the Response Panel, look at the Body tab:

- Response should have field: `x-inject-res-body: "Injected WASM value onResponseBody"`

### 5. Check Final Response

The target URL (https://www.godronus.xyz/200) returns status 200 responses:

- Should show request headers including injected `x-custom-request`
- Should show request body with injected field (if x-inject-req-body header was enabled)

## Common Issues

### WASM Not Loading

**Error**: "Failed to load WASM file"

**Solution**:

- Check file exists: `ls -lh wasm/cdn_header_change.wasm`
- Verify it's a valid WASM file: `file wasm/cdn_header_change.wasm`

### No Logs Appearing

**Problem**: Hooks execute but no debug logs

**Solution**:

- Set log level to 0 (Trace) in the Hooks Panel
- The WASM uses `LogLevelValues.debug` - make sure log level ≤ 1

### Body Not Modified

**Problem**: Request/response body doesn't show injected fields

**Checklist**:

- ✅ Headers include `x-inject-req-body` or `x-inject-res-body`
- ✅ Content-Type is `application/json`
- ✅ Body is valid JSON
- ✅ Check "end_of_stream" is true in logs

### WebSocket Not Connecting

**Problem**: Connection status shows "Disconnected"

**Solution**:

- If using dev mode: Ensure both backend (5179) and frontend (5173) are running
- Check browser console for WebSocket errors
- Access via http://127.0.0.1:5173 (not localhost) for faster connection

## Advanced Testing

### Test Multiple Scenarios

Create multiple config files:

```bash
# Save current config as scenario 1
cp fastedge-config.test.json configs/scenario-1-body-injection.json

# Modify fastedge-config.test.json for scenario 2
# ... make changes in UI ...
# Save as scenario 2
cp fastedge-config.test.json configs/scenario-2-header-only.json

# Switch between scenarios
cp configs/scenario-1-body-injection.json fastedge-config.test.json
# Click "Load Config" in UI
```

### Automated Testing with AI

**Regression test prompt:**

> "Load the test config and verify all 4 WASM hooks execute successfully with no errors. Check that request and response modifications are applied correctly."

**Performance test prompt:**

> "Run the test configuration 10 times and measure the average execution time for each hook. Report any hooks that take longer than 50ms."

**Edge case testing prompt:**

> "Test the WASM with these edge cases: empty body, very large body (10KB JSON), body with special characters, body with nested arrays. Report which cases work correctly."

## Next Steps

1. **Try the default config**: Load config → Send request → Verify results
2. **Modify and save**: Change headers/body → Save config → Reload to verify
3. **Test with AI**: Give AI a testing task using the config system
4. **Create test scenarios**: Build a library of test configs for different use cases

## Getting Help

If something isn't working:

1. Check browser console for errors
2. Check backend logs for WASM execution errors
3. Verify WebSocket connection status
4. Use log level 0 (Trace) to see all debug output
5. Check the Response Panel for actual vs expected results

Last Updated: February 26, 2026
