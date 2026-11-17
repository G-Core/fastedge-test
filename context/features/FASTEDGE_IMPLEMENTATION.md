# FastEdge Host Functions Implementation

## Overview

This document describes the FastEdge-specific host function extensions in fastedge-test's proxy-wasm runner. These extensions provide production parity with G-Core's FastEdge CDN runtime, enabling testing of WASM binaries that use secrets and configuration management.

## Background

### Production Environment

- **Runtime:** G-Core FastEdge CDN (nginx + custom wasmtime host)
- **WASM Type:** HTTP WASM applications (wasi-http component model)
- **Extensions:** FastEdge provides additional host functions beyond standard proxy-wasm ABI
- **Use Cases:** Secret management, configuration, Key-Value store, statistics

### FastEdge Functions in Production

Based on Rust implementation in `rust_host/proxywasm/src/host/`:

1. **Secrets** (`secret.rs`):
   - `proxy_get_secret(key_ptr, key_len, value_ptr_ptr, value_len_ptr)` → ProxyStatus
   - `proxy_get_effective_at_secret(key_ptr, key_len, timestamp, value_ptr_ptr, value_len_ptr)` → ProxyStatus
   - `proxy_secret_get(...)` → Alias for proxy_get_secret

2. **Dictionary** (`dictionary.rs`):
   - `proxy_dictionary_get(key_ptr, key_len, value_ptr_ptr, value_len_ptr)` → ProxyStatus

3. **Key-Value Store and cache** (`key_value.rs`):
   - `proxy_kv_store_*` and `proxy_cache_*`, implemented in `server/runner/StoresHost.ts`
     (see [STORES.md](STORES.md))

4. **Statistics** (`stats.rs`): not implemented in the runner

5. **Proxy Extensions** (`proxy.rs`): additional proxy-wasm extensions, not implemented in the runner

## Architecture

### Module Structure

```
server/fastedge-host/
├── types.ts              # Type definitions
│   ├── FastEdgeConfig   # Configuration interface
│   ├── ISecretStore     # Secret store interface
│   ├── IDictionary      # Dictionary interface
│   ├── SecretWithTimestamp
│   └── ProxyStatus enum
│
├── SecretStore.ts        # Secret management with time-based rotation
│   ├── get(key): string | undefined
│   └── getEffectiveAt(key, timestamp): string | undefined
│
├── Dictionary.ts         # Key-value configuration store
│   ├── get(key): string | undefined
│   ├── set(key, value): void
│   ├── has(key): boolean
│   ├── clear(): void
│   └── load(data): void
│
├── hostFunctions.ts      # WASM host function factory
│   └── createFastEdgeHostFunctions(memory, secretStore, dictionary, logDebug)
│       ├── proxy_get_secret
│       ├── proxy_get_effective_at_secret
│       ├── proxy_secret_get
│       └── proxy_dictionary_get
│
└── index.ts              # Module exports
```

### Design Philosophy

**Separation of Concerns:**

- Separate folder (`fastedge-host/`) keeps FastEdge extensions isolated
- Standard proxy-wasm code remains in `runner/`
- Easy to update when FastEdge runtime changes
- Clear distinction between standard and extended functionality

**Production Parity:**

- Follows exact Rust implementation patterns
- Same function signatures and return codes
- Same memory management approach (pointer-to-pointer)
- Compatible with production FastEdge SDKs

**Type Safety:**

- TypeScript interfaces for all components
- Explicit error handling with ProxyStatus enum
- Validated input parameters

## Implementation Details

### SecretStore.ts

**Purpose:** Manage encrypted configuration values with time-based rotation support.

**Features:**

- Supports simple string values: `{ JWT_SECRET: "my-secret" }`
- Supports time-based rotation: `{ API_KEY: [{value: "old", effectiveAt: 1609459200}, {value: "new", effectiveAt: 1640995200}] }`
- `getEffectiveAt(key, timestamp)` returns appropriate secret based on effectiveAt timestamps
- Automatic selection of most recent valid secret

**Example:**

```typescript
const secretStore = new SecretStore({
  JWT_SECRET: "simple-secret",
  API_KEY: [
    { value: "key-v1", effectiveAt: 1609459200 }, // Jan 1, 2021
    { value: "key-v2", effectiveAt: 1640995200 }, // Jan 1, 2022
    { value: "key-v3", effectiveAt: 1672531200 }, // Jan 1, 2023
  ],
});

// Get current secret (uses Date.now())
const current = secretStore.get("API_KEY"); // Returns "key-v3"

// Get secret at specific time
const historical = secretStore.getEffectiveAt("API_KEY", 1625097600); // Returns "key-v2"
```

**Time-Based Rotation Logic:**

1. Filter secrets to those with `effectiveAt <= timestamp`
2. Sort by `effectiveAt` descending
3. Return the first (most recent) match
4. Return undefined if no valid secrets found

### Dictionary.ts

**Purpose:** Simple key-value configuration store for non-sensitive data.

**Features:**

- Basic CRUD operations (get, set, has, clear)
- Bulk loading from object
- Returns all entries via `getAll()`
- Type: `Map<string, string>`

**Example:**

```typescript
const dictionary = new Dictionary({
  API_URL: "https://api.example.com",
  LOG_LEVEL: "debug",
  FEATURE_FLAG_NEW_UI: "true",
  CACHE_TTL: "3600",
});

dictionary.get("API_URL"); // "https://api.example.com"
dictionary.set("API_URL", "https://api-v2.example.com");
dictionary.has("LOG_LEVEL"); // true
```

### hostFunctions.ts

**Purpose:** Factory function that creates WASM-compatible host functions.

**Function Signatures:**

```typescript
proxy_get_secret(
  key_ptr: number,
  key_len: number,
  value_ptr_ptr: number,
  value_len_ptr: number
): ProxyStatus

proxy_get_effective_at_secret(
  key_ptr: number,
  key_len: number,
  timestamp: number,
  value_ptr_ptr: number,
  value_len_ptr: number
): ProxyStatus

proxy_secret_get(
  key_ptr: number,
  key_len: number,
  value_ptr_ptr: number,
  value_len_ptr: number
): ProxyStatus  // Alias for proxy_get_secret

proxy_dictionary_get(
  key_ptr: number,
  key_len: number,
  value_ptr_ptr: number,
  value_len_ptr: number
): ProxyStatus
```

**Memory Management Pattern (Rust-compatible):**

```typescript
// 1. Read key from WASM memory
const key = memory.readString(key_ptr, key_len);

// 2. Retrieve value from store
const value = secretStore.get(key);
if (!value) {
  return ProxyStatus.NotFound;
}

// 3. Allocate memory for value
const valuePtr = memory.allocateString(value);

// 4. Write pointer and length back to WASM (pointer-to-pointer)
const view = new DataView(memory.getBuffer());
view.setUint32(value_ptr_ptr, valuePtr, true); // little-endian
view.setUint32(value_len_ptr, value.length, true);

// 5. Log for debugging
logDebug(`proxy_get_secret: ${key} -> ${value.substring(0, 20)}...`);

return ProxyStatus.Ok;
```

**ProxyStatus Return Codes:**

```typescript
enum ProxyStatus {
  Ok = 0, // Success
  NotFound = 1, // Key not found
  BadArgument = 2, // Invalid arguments
  // ... other codes as needed
}
```

### Integration with HostFunctions.ts

The FastEdge functions are integrated into the standard proxy-wasm host functions:

```typescript
// server/runner/HostFunctions.ts

import {
  SecretStore,
  Dictionary,
  createFastEdgeHostFunctions,
  type FastEdgeConfig,
} from "../fastedge-host/index.js";

export class HostFunctions {
  private secretStore: SecretStore;
  private dictionary: Dictionary;

  constructor(
    memory: MemoryManager,
    propertyResolver: PropertyResolver,
    debug = false,
    secretStore?: SecretStore,
    dictionary?: Dictionary,
  ) {
    // ... standard initialization
    this.secretStore = secretStore ?? new SecretStore();
    this.dictionary = dictionary ?? new Dictionary();
  }

  createImports(): any {
    return {
      // Standard proxy-wasm functions
      proxy_log: () => {...},
      proxy_get_property: () => {...},
      // ... other standard functions

      // FastEdge extensions (spread into imports)
      ...createFastEdgeHostFunctions(
        this.memory,
        this.secretStore,
        this.dictionary,
        (msg: string) => this.logs.push({ level: 0, message: msg }),
      ),
    };
  }
}
```

### Integration with ProxyWasmRunner.ts

The runner accepts FastEdge configuration on construction:

```typescript
// server/runner/ProxyWasmRunner.ts

import {
  SecretStore,
  Dictionary,
  type FastEdgeConfig,
} from "../fastedge-host/index.js";

export class ProxyWasmRunner {
  private secretStore: SecretStore;
  private dictionary: Dictionary;

  constructor(fastEdgeConfig?: FastEdgeConfig) {
    this.memory = new MemoryManager();
    this.propertyResolver = new PropertyResolver();

    // Initialize FastEdge stores
    this.secretStore = new SecretStore(fastEdgeConfig?.secrets);
    this.dictionary = new Dictionary(fastEdgeConfig?.dictionary);

    this.hostFunctions = new HostFunctions(
      this.memory,
      this.propertyResolver,
      this.debug,
      this.secretStore,
      this.dictionary,
    );
  }
}
```

## Dotenv Support

### File Formats

Following [FastEdge VSCode extension](https://github.com/G-Core/FastEdge-vscode/blob/main/DOTENV.md) patterns:

**Option 1: Single .env file with prefixes**

```bash
# .env
FASTEDGE_VAR_SECRET_JWT_SECRET=my-jwt-secret
FASTEDGE_VAR_SECRET_API_KEY=sk_test_12345
FASTEDGE_VAR_ENV_API_URL=https://api.example.com
FASTEDGE_VAR_ENV_LOG_LEVEL=debug
```

**Option 2: Separate files (no prefix needed)**

```bash
# .env.secrets
JWT_SECRET=my-jwt-secret
API_KEY=sk_test_12345
DATABASE_PASSWORD=postgres123

# .env.variables
API_URL=https://api.example.com
LOG_LEVEL=debug
FEATURE_FLAG_NEW_UI=true
```

### Dotenv Loading

Implemented in `server/utils/dotenv-loader.ts` and enabled per load with
`dotenv: { enabled, path }`. See [DOTENV.md](DOTENV.md) for behaviour, the UI toggle and path
resolution.

## WASM Usage Examples

### Rust (proxy-wasm)

Using the G-Core proxy-wasm SDK:

```rust
use proxy_wasm::traits::*;
use proxy_wasm::types::*;

// Get a secret
match self.get_property(vec!["secret", "JWT_SECRET"]) {
    Some(secret_bytes) => {
        let jwt_secret = String::from_utf8(secret_bytes).unwrap();
        // Use jwt_secret...
    },
    None => {
        log::warn("JWT_SECRET not found");
    }
}

// Get dictionary value
match self.get_property(vec!["dictionary", "API_URL"]) {
    Some(url_bytes) => {
        let api_url = String::from_utf8(url_bytes).unwrap();
        // Use api_url...
    },
    None => {
        log::warn("API_URL not configured");
    }
}
```

### JavaScript (HTTP apps, wasi-http)

Using the FastEdge SDK:

```javascript
import { getSecret } from "fastedge::secret";
import { getEnv } from "fastedge::env";

async function eventHandler(event) {
  // Get secret
  const jwtSecret = getSecret("JWT_SECRET");
  if (!jwtSecret) {
    return new Response("Configuration error", { status: 500 });
  }

  // Get dictionary value
  const apiUrl = getEnv("API_URL") || "https://default-api.example.com";

  // Use values...
  const response = await fetch(`${apiUrl}/data`, {
    headers: {
      Authorization: `Bearer ${jwtSecret}`,
    },
  });

  return response;
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
```

## Testing

### Manual Testing

**Setup:**

1. Create `.env.secrets`:

   ```bash
   JWT_SECRET=test-jwt-secret-12345
   API_KEY=sk_test_abc123def456
   DATABASE_PASSWORD=postgres_test_pwd
   ```

2. Create `.env.variables`:

   ```bash
   API_URL=https://api.example.com
   LOG_LEVEL=debug
   FEATURE_FLAG_NEW_UI=true
   CACHE_TTL=3600
   ```

3. Compile WASM that calls `proxy_get_secret` and `proxy_dictionary_get`

4. Load WASM and verify logs show secret/dictionary retrievals

**Expected Output:**

```
[Trace] proxy_get_secret: JWT_SECRET -> test-jwt-secret-12...
[Trace] proxy_dictionary_get: API_URL -> https://api.example.com
```

### Automated Testing

`server/__tests__/integration/cdn-apps/variables-and-secrets/` covers env, dictionary and secret
reads from dotenv fixtures (see [CDN_VARIABLES_AND_SECRETS.md](CDN_VARIABLES_AND_SECRETS.md)).

## Security Considerations

**Sensitive Data:**

- Secrets stored in memory only (not persisted)
- `.env*` files must be in `.gitignore`
- No secret logging in production mode
- Truncate secrets in debug logs (first 20 chars only)

**.gitignore:**

```gitignore
# Environment files with secrets
.env
.env.*
!.env.example
```

**Production Deployment:**

- Test runner is for local development only
- Never deploy with real production secrets
- Use separate secret management for production FastEdge

## References

- **Rust Implementation:** `rust_host/proxywasm/src/host/` (secret.rs, dictionary.rs, key_value.rs, stats.rs, proxy.rs)
- **FastEdge VSCode Extension:** [DOTENV.md](https://github.com/G-Core/FastEdge-vscode/blob/main/DOTENV.md)
- **FastEdge SDK Rust:** https://github.com/G-Core/FastEdge-sdk-rust
- **FastEdge SDK JS:** https://github.com/G-Core/FastEdge-sdk-js
- **FastEdge Runtime:** https://github.com/G-Core/FastEdge-lib
- **Proxy-WASM Spec:** https://github.com/proxy-wasm/spec
