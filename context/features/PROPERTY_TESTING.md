# Property Testing Guide

## What Was Implemented

The server properties integration is now complete! Here's what was added:

### 1. Runtime Property Extraction from URL

The system now automatically extracts these properties from the target URL:

- `request.url` - Full URL (e.g., "https://example.com/api/users?page=1")
- `request.host` - Hostname with port (e.g., "example.com:8080" or "example.com")
- `request.path` - URL path (e.g., "/api/users")
- `request.query` - Query string without ? (e.g., "page=1&limit=10")
- `request.scheme` - Protocol (e.g., "https" or "http")
- `request.extension` - File extension from path (e.g., "json", "html", "" for no extension)
- `request.method` - HTTP method from request

### 2. Property Priority System

Properties are resolved in this order:

1. **User-provided properties** (from UI or API) - HIGHEST PRIORITY
2. **Runtime-calculated properties** (from target URL) - FALLBACK

This means you can:

- Let the system calculate properties automatically
- Override any calculated property with a custom value
- Set custom properties that don't exist in standard set

### 3. Enhanced get_property / set_property

- `get_property()` - Read any property (user or runtime)
- `set_property()` - WASM can now set custom properties at runtime

## How to Test

### Test 1: Verify Runtime Properties Are Extracted

1. Start the server:

   ```bash
   pnpm build
   pnpm start
   ```

2. Open UI at `http://127.0.0.1:5179`

3. Load your WASM binary (`cdn_header_change.wasm`)

4. Set target URL to something with various components:

   ```
   https://example.com:8080/api/users.json?page=1&limit=10
   ```

5. Add logging to your WASM to print properties:

   ```typescript
   log(LogLevelValues.info, `request.url: ${get_property("request.url")}`);
   log(LogLevelValues.info, `request.host: ${get_property("request.host")}`);
   log(LogLevelValues.info, `request.path: ${get_property("request.path")}`);
   log(LogLevelValues.info, `request.query: ${get_property("request.query")}`);
   log(
     LogLevelValues.info,
     `request.scheme: ${get_property("request.scheme")}`,
   );
   log(
     LogLevelValues.info,
     `request.extension: ${get_property("request.extension")}`,
   );
   log(
     LogLevelValues.info,
     `request.method: ${get_property("request.method")}`,
   );
   ```

6. Click "Send" and check the Logs tab

**Expected Output:**

```
request.url: https://example.com:8080/api/users.json?page=1&limit=10
request.host: example.com:8080
request.path: /api/users.json
request.query: page=1&limit=10
request.scheme: https
request.extension: json
request.method: POST
```

### Test 2: Verify User Properties Override Calculated Ones

1. In the Server Properties panel, set:

   ```
   request.country: LU
   request.city: Luxembourg
   request.host: my-custom-host.com  (override calculated host)
   ```

2. Use the same WASM with logging

3. Click "Send"

**Expected:**

- `request.host` should show `my-custom-host.com` (your override)
- `request.url` will still use the target URL's host for fetching
- `request.country` and `request.city` show your custom values

### Test 3: Test Header Access via Properties

Properties can also access headers:

```typescript
// In your WASM:
const contentType = get_property("request.headers.content-type");
const customHeader = get_property("request.headers.x-custom-header");

log(LogLevelValues.info, `Content-Type: ${contentType}`);
log(LogLevelValues.info, `Custom Header: ${customHeader}`);
```

Set headers in UI:

```
content-type: application/json
x-custom-header: my-value
```

**Expected:**

```
Content-Type: application/json
Custom Header: my-value
```

### Test 4: Test set_property from WASM

```typescript
// In your WASM onRequestHeaders:
set_property("my.custom.value", "set from WASM");

// Later in onRequestBody:
const customValue = get_property("my.custom.value");
log(LogLevelValues.info, `Custom value: ${customValue}`);
```

**Expected:**

```
Custom value: set from WASM
```

**Note:** Due to isolated hook execution, properties set in one hook won't be visible in another hook unless we implement property persistence (future enhancement).

### Test 5: Test with curl (AI Agent Style)

```bash
curl -X POST http://127.0.0.1:5179/api/send \
  -H "Content-Type: application/json" \
  -H "X-Source: test" \
  -d '{
    "url": "https://api.example.com/users?page=1",
    "request": {
      "method": "GET",
      "headers": {
        "content-type": "application/json"
      },
      "body": ""
    },
    "properties": {
      "request.country": "DE",
      "request.city": "Frankfurt"
    }
  }'
```

Check the response logs to verify:

- Runtime properties extracted from URL
- User properties (country, city) respected
- Everything accessible via get_property

## Property Reference

### Runtime-Calculated Properties (from URL)

| Property            | Example                    | Source                      |
| ------------------- | -------------------------- | --------------------------- |
| `request.url`       | `https://example.com/path` | Target URL                  |
| `request.host`      | `example.com:8080`         | URL hostname + port         |
| `request.path`      | `/api/users`               | URL pathname                |
| `request.query`     | `page=1&limit=10`          | URL search params           |
| `request.scheme`    | `https`                    | URL protocol                |
| `request.extension` | `json`                     | Last path segment after dot |
| `request.method`    | `POST`                     | Request method              |

### User-Provided Properties (from UI/API)

| Property            | Example      | Source     |
| ------------------- | ------------ | ---------- |
| `request.country`   | `LU`         | User input |
| `request.city`      | `Luxembourg` | User input |
| `request.geo.lat`   | `49.6116`    | User input |
| `request.geo.long`  | `6.1319`     | User input |
| `request.region`    | `Luxembourg` | User input |
| `request.continent` | `Europe`     | User input |
| (any custom)        | (any value)  | User input |

### Header Access Properties

| Property                  | Example                         | Source           |
| ------------------------- | ------------------------------- | ---------------- |
| `request.headers.{name}`  | `request.headers.content-type`  | Request headers  |
| `response.headers.{name}` | `response.headers.content-type` | Response headers |

### Response Properties

| Property                | Example | Source               |
| ----------------------- | ------- | -------------------- |
| `response.code`         | `200`   | Response status      |
| `response.status`       | `200`   | Response status      |
| `response.code_details` | `OK`    | Response status text |

## Debugging

Enable debug mode to see property resolution:

```bash
PROXY_RUNNER_DEBUG=1 pnpm start
```

You'll see:

- URL parsing results
- Property lookups (get_property calls)
- Property sets (set_property calls)
- Which properties were found/missed

## Known Limitations

1. **Property persistence across hooks:** Due to isolated hook execution (each hook gets fresh WASM instance), properties set via `set_property` in one hook won't be visible in subsequent hooks. This is production-accurate behavior.

2. **No x_real_ip / asn simulation:** These properties (`request.x_real_ip`, `request.asn`) would come from nginx in production. In the test runner, you must set them manually via the properties panel.

## Next Steps

Now that properties work, you can:

1. **Test geo-location routing:**

   ```typescript
   const country = get_property("request.country");
   if (country === "US") {
     // US-specific logic
   }
   ```

2. **Test dynamic header injection based on properties:**

   ```typescript
   const region = get_property("request.region");
   add_header("X-Client-Region", region);
   ```

3. **Test custom business logic:**

   ```typescript
   const path = get_property("request.path");
   const method = get_property("request.method");

   if (method === "POST" && path.startsWith("/admin")) {
     // Admin endpoint logic
   }
   ```

4. **Test AI agent workflows:**
   - Have an AI agent read properties via `/api/config`
   - Send requests with custom properties
   - Verify WASM behaves correctly based on properties

Happy testing! 🎉
