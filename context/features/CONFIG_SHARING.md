# Configuration Sharing

## Overview

The Proxy-WASM Test Runner supports sharing test configurations between the UI and AI agents through a `fastedge-config.test.json` file. This allows developers to:

1. Set up test scenarios in the UI
2. Save the configuration for reuse
3. Let AI agents read and use the same configuration
4. Override specific settings in prompts to AI agents

## Quick Start

### For Developers (Using UI)

1. **Set up your test**:
   - Load your WASM binary
   - Configure request method, URL, headers, and body
   - Set server properties (country, city, geo-location, etc.)
   - Set log level

2. **Save configuration**:
   - Click the "💾 Save Config" button in the WASM Loader section
   - Configuration is saved to `fastedge-config.test.json`

3. **Load configuration**:
   - Click the "📥 Load Config" button
   - All UI settings will be restored from `fastedge-config.test.json`

### For AI Agents

AI agents can read the configuration file to understand the current test setup:

```typescript
// Read configuration
const config = await fetch("http://localhost:5179/api/config").then((r) =>
  r.json(),
);

// Use settings with optional overrides
// For CDN (proxy-wasm) configs, use request.url; for HTTP (http-wasm), use request.path
const testRequest = {
  url: config.config.request.url,       // CDN configs
  path: config.config.request.path,     // HTTP configs
  request: {
    method: config.config.request.method,
    headers: {
      ...config.config.request.headers,
      // Override specific headers as needed
      "x-custom-test": "AI agent test value",
    },
    body: config.config.request.body,
  },
  properties: config.config.properties,
  logLevel: config.config.logLevel,
};
```

## Configuration File Format

### Location

`/home/gdoco/dev/playground/proxy-runner/fastedge-config.test.json`

### Structure

The config schema uses a discriminated union on `appType`. CDN (proxy-wasm) configs use `request.url` (full URL), while HTTP (http-wasm) configs use `request.path` (path only).

**CDN / Proxy-WASM config** (`appType: "proxy-wasm"`):

```json
{
  "appType": "proxy-wasm",
  "description": "Test configuration for proxy-wasm debugging",
  "wasm": {
    "path": "wasm/cdn_header_change.wasm",
    "description": "Header modification test - injects custom headers"
  },
  "request": {
    "method": "POST",
    "url": "http://fastedge-builtin.debug",
    "headers": {
      "x-inject-req-body": "Injected WASM value onRequestBody",
      "x-inject-res-body": "Injected WASM value onResponseBody"
    },
    "body": "{\"message\": \"Hello\"}"
  },
  "properties": {
    "request.country": "LU",
    "request.city": "Luxembourg",
    "request.region": "LU",
    "request.geo-location": "49.6116,6.1319"
  },
  "logLevel": 0
}
```

**HTTP / HTTP-WASM config** (`appType: "http-wasm"`):

```json
{
  "appType": "http-wasm",
  "description": "Test configuration for http-wasm app",
  "wasm": {
    "path": "wasm/http-apps/sdk-examples/sdk-basic.wasm",
    "description": "Basic HTTP WASM app"
  },
  "request": {
    "method": "GET",
    "path": "/api/hello?q=1",
    "headers": {},
    "body": ""
  },
  "logLevel": 0
}
```

### Fields

| Field              | Type   | Description                                                      |
| ------------------ | ------ | ---------------------------------------------------------------- |
| `appType`          | string | `"proxy-wasm"` or `"http-wasm"` — determines config shape        |
| `description`      | string | Human-readable description of this config                        |
| `wasm.path`        | string | Path to WASM file (relative to project root)                     |
| `wasm.description` | string | Description of what this WASM does                               |
| `request.method`   | string | HTTP method (GET, POST, etc.)                                    |
| `request.url`      | string | **(CDN only)** Full target URL for the request                   |
| `request.path`     | string | **(HTTP only)** Request path (e.g. `/api/hello?q=1`)            |
| `request.headers`  | object | Request headers (key-value pairs)                                |
| `request.body`     | string | Request body content                                             |
| `properties`       | object | **(CDN only)** Server properties (geo-location, country, etc.)   |
| `logLevel`         | number | Log level: 0=Trace, 1=Debug, 2=Info, 3=Warn, 4=Error, 5=Critical |

## API Endpoints

### GET /api/config

Load the current test configuration.

**Response:**

```json
{
  "ok": true,
  "config": {
    /* TestConfig object */
  }
}
```

### POST /api/config

Save a new test configuration.

**Request:**

```json
{
  "config": {
    /* TestConfig object */
  }
}
```

**Response:**

```json
{
  "ok": true
}
```

## Usage Examples

### Example 1: AI Agent Reading Config

```bash
# AI agent reads current configuration
curl http://localhost:5179/api/config | jq '.config'
```

### Example 2: AI Agent Testing with Override

An AI agent can read the base config and override specific values:

**Developer's prompt to AI:**

> "Test the change-header WASM with the current settings, but change the request body to include a 'test' field"

**AI agent's workflow:**

1. Read `fastedge-config.test.json` to get baseline settings
2. Load the WASM binary from `wasm/cdn_header_change.wasm`
3. Use the configured URL, headers, and properties
4. Override the request body with `{"message": "Hello", "test": true}`
5. Send the request and report results

```bash
# AI loads WASM
WASM_BASE64=$(base64 -w 0 wasm/cdn_header_change.wasm)
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -H "X-Source: ai_agent" \
  -d "{\"wasmBase64\": \"$WASM_BASE64\"}"

# AI reads config
CONFIG=$(curl -s http://localhost:5179/api/config | jq '.config')

# AI sends request with override
curl -X POST http://localhost:5179/api/send \
  -H "Content-Type: application/json" \
  -H "X-Source: ai_agent" \
  -d "{
    \"url\": $(echo $CONFIG | jq -r '.request.url' | jq -R .),
    \"request\": {
      \"method\": $(echo $CONFIG | jq -r '.request.method' | jq -R .),
      \"headers\": $(echo $CONFIG | jq '.request.headers'),
      \"body\": \"{\\\"message\\\": \\\"Hello\\\", \\\"test\\\": true}\"
    },
    \"properties\": $(echo $CONFIG | jq '.properties'),
    \"logLevel\": $(echo $CONFIG | jq '.logLevel')
  }"
```

### Example 3: Switching Between Test Scenarios

A developer can maintain multiple config files:

```bash
# Save different scenarios
cp fastedge-config.test.json configs/scenario-1-header-injection.json
cp fastedge-config.test.json configs/scenario-2-body-modification.json

# Load a specific scenario
cp configs/scenario-1-header-injection.json fastedge-config.test.json
# Click "Load Config" in UI
```

## Workflow: Developer + AI Agent Collaboration

### Typical Flow

1. **Developer sets up test**:
   - Loads WASM binary via UI
   - Configures request settings for a specific test scenario
   - Clicks "💾 Save Config"

2. **Developer prompts AI**:

   > "Run the current test configuration 5 times with different cities: Luxembourg, Paris, Berlin, London, Madrid. Report any differences in the responses."

3. **AI agent workflow**:
   - Reads `fastedge-config.test.json` via `/api/config`
   - Loads WASM binary from `wasm.path`
   - Loops 5 times, each time:
     - Uses base config
     - Overrides `request.city` property
     - Sends request via `/api/send`
     - Collects results
   - Analyzes and reports differences

4. **Developer sees results**:
   - All 5 requests appear in UI in real-time (via WebSocket)
   - Can inspect each request's hook execution
   - Can see AI agent's analysis

### Benefits

- ✅ **No manual copying**: AI reads settings directly from config file
- ✅ **Consistent baseline**: Both developer and AI use same settings
- ✅ **Override flexibility**: AI can modify specific values per prompt
- ✅ **Version control**: Config file can be committed to git
- ✅ **Real-time visibility**: Developer sees AI's tests in UI

## Best Practices

1. **Save meaningful configs**: Use descriptive names in `wasm.description`
2. **Document test scenarios**: Update `description` field to explain what's being tested
3. **Commit to git**: Track test configurations alongside code
4. **Use overrides wisely**: Keep base config stable, override only what changes
5. **Check results in UI**: Even when AI runs tests, verify in the UI

## Troubleshooting

### Config file not found

If you see "Config file not found", create one:

- Set up your test in the UI
- Click "💾 Save Config"
- Or manually create `fastedge-config.test.json` with the structure above

### WASM path incorrect

The `wasm.path` in config is relative to project root. For example:

- ✅ `"wasm/cdn_header_change.wasm"`
- ❌ `"/home/user/wasm/file.wasm"` (absolute paths won't work for AI agents)

### AI agent can't load WASM

Make sure the WASM file is loaded before sending requests:

```bash
# 1. Load WASM first
curl -X POST http://localhost:5179/api/load -d '{"wasmBase64": "..."}'

# 2. Then send requests
curl -X POST http://localhost:5179/api/send -d '{...}'
```
