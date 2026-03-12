# Dotenv Toggle Implementation

**Date**: February 5, 2026
**Status**: ✅ Implemented

## Overview

Added a prominent toggle in the Server Properties panel header to enable/disable dotenv file loading. The toggle is ON by default and controls whether `.env`, `.env.secrets`, and `.env.variables` files are loaded when WASM binaries are loaded.

## Features

### UI Toggle

- **Location**: Server Properties panel header (right side)
- **Default**: ON (enabled by default)
- **Visual Indicator**: Green dot (●) when enabled
- **Behavior**: Click to toggle, doesn't collapse panel when clicked

### Backend Support

- **dotenvEnabled Parameter**: Added to ProxyWasmRunner constructor (default: `true`)
- **Dotenv Loader**: New utility at `server/utils/dotenv-loader.ts`
- **File Support**: Loads `.env` (with prefixes), `.env.secrets`, `.env.variables`
- **Merging**: Dotenv values merge with existing FastEdge config (dotenv takes precedence)

### API Integration

- **POST /api/load**: Accepts `dotenvEnabled` boolean (default: `true`)
- **AI Agent Support**: AI agents can control dotenv loading via request body

## File Structure

```
server/
  utils/
    dotenv-loader.ts          # NEW: Dotenv file parser and loader
  runner/
    ProxyWasmRunner.ts        # MODIFIED: Accept dotenvEnabled, load files
    types.ts                  # MODIFIED: Add dotenvEnabled to HookCall
  server.ts                   # MODIFIED: Handle dotenvEnabled in /api/load

frontend/
  src/
    components/
      Toggle/                 # NEW: Reusable toggle component (folder pattern)
        Toggle.tsx            # Component implementation
        Toggle.module.css     # CSS Module styles
        index.tsx             # Barrel export
      ServerPropertiesPanel.tsx  # MODIFIED: Add toggle in header
    hooks/
      useWasm.ts              # MODIFIED: Pass dotenvEnabled to uploadWasm
    api/
      index.ts                # MODIFIED: Send dotenvEnabled to backend
    App.tsx                   # MODIFIED: Add dotenvEnabled state

.env.example                  # UPDATED: Better documentation
.env.secrets.example          # NEW: Example secrets file
.env.variables.example        # NEW: Example dictionary file
```

## Usage

### For Developers (UI)

1. Open the application
2. Look at Server Properties panel header
3. Toggle "Load .env files" checkbox
   - ✅ ON (default): Dotenv files loaded when WASM loads
   - ❌ OFF: Dotenv files ignored
4. Load your WASM binary
5. Dotenv values automatically available via `proxy_get_secret` and `proxy_dictionary_get`

**Visual Feedback:**

- Green dot (●) when enabled
- Info box below properties when enabled
- Toggle state persists while app is open

### For AI Agents (API)

#### Load WASM with dotenv enabled (default):

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -H "X-Source: ai_agent" \
  -d '{
    "wasmBase64": "...",
    "dotenvEnabled": true
  }'
```

#### Load WASM without dotenv:

```bash
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -H "X-Source: ai_agent" \
  -d '{
    "wasmBase64": "...",
    "dotenvEnabled": false
  }'
```

## Dotenv File Formats

### Option 1: Single .env file with prefixes

```bash
# .env
FASTEDGE_VAR_SECRET_JWT_SECRET=my-secret
FASTEDGE_VAR_SECRET_API_KEY=sk_test_12345
FASTEDGE_VAR_ENV_API_URL=https://api.example.com
FASTEDGE_VAR_ENV_LOG_LEVEL=debug
```

### Option 2: Separate files (recommended)

**.env.secrets** (accessed via `proxy_get_secret`):

```bash
JWT_SECRET=my-secret
API_KEY=sk_test_12345
DATABASE_PASSWORD=postgres123
```

**.env.variables** (accessed via `proxy_dictionary_get`):

```bash
API_URL=https://api.example.com
LOG_LEVEL=debug
FEATURE_FLAG_NEW_UI=true
CACHE_TTL=3600
```

## Implementation Details

### Dotenv Loader (`server/utils/dotenv-loader.ts`)

**Key Functions:**

- `parseDotenv(content: string)`: Parse .env file content
- `loadDotenvFiles(path: string)`: Load all dotenv files and return FastEdgeConfig
- `hasDotenvFiles(path: string)`: Check if any dotenv files exist

**Features:**

- Handles comments (lines starting with `#`)
- Handles quoted values (`"value"` or `'value'`)
- Supports empty values
- Strips FASTEDGE*VAR_SECRET* and FASTEDGE*VAR_ENV* prefixes
- Merges all sources into single FastEdgeConfig

### ProxyWasmRunner Changes

**Constructor:**

```typescript
constructor(fastEdgeConfig?: FastEdgeConfig, dotenvEnabled: boolean = true) {
  // ...
  this.dotenvEnabled = dotenvEnabled;
  // Initialize stores
}
```

**load() Method:**

```typescript
async load(buffer: Buffer): Promise<void> {
  // Compile WASM
  this.module = await WebAssembly.compile(buffer);

  // Load dotenv if enabled
  await this.loadDotenvIfEnabled();
}
```

**loadDotenvIfEnabled():**

- Checks `this.dotenvEnabled` flag
- Calls `loadDotenvFiles(".")`
- Merges secrets and dictionary with existing values
- Recreates HostFunctions with updated stores
- Logs count of loaded secrets/dictionary entries

## Testing

### Manual Test

1. Create `.env.secrets`:

```bash
JWT_SECRET=test-secret-123
API_KEY=sk_test_abc
```

2. Create `.env.variables`:

```bash
API_URL=https://test-api.example.com
LOG_LEVEL=debug
```

3. Start server and open UI
4. Verify toggle is ON by default (green dot visible)
5. Load WASM binary
6. Check server logs for:

```
Loaded 2 secrets from dotenv files
Loaded 2 dictionary entries from dotenv files
```

7. In WASM code, access values:

```typescript
const secret = Host.getProperty("secret.JWT_SECRET");
const apiUrl = Host.getProperty("dictionary.API_URL");
```

8. Toggle OFF and reload WASM
9. Verify dotenv files not loaded

### AI Agent Test

```bash
# With dotenv enabled
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{"wasmBase64":"...", "dotenvEnabled":true}'

# With dotenv disabled
curl -X POST http://localhost:5179/api/load \
  -H "Content-Type: application/json" \
  -d '{"wasmBase64":"...", "dotenvEnabled":false}'
```

## Benefits

1. **Developer Control**: Easy toggle to enable/disable dotenv without code changes
2. **Visual Feedback**: Green dot and info box show current state clearly
3. **Default ON**: Sensible default for local development
4. **AI Agent Support**: Programmatic control via API flag
5. **Prominent Placement**: Toggle in panel header makes it easy to find
6. **Production Parity**: Matches FastEdge runtime dotenv behavior
7. **Security**: Encourages use of .env files instead of hardcoding secrets

## Security Notes

**.gitignore** should include:

```gitignore
.env
.env.*
!.env.example
!.env.*.example
```

**Best Practices:**

- Never commit actual .env files
- Use .env.example files to document required variables
- Keep secrets in .env.secrets separate from config
- Disable dotenv in production (use actual secret management)

## Future Enhancements

Possible improvements:

1. **Visual dotenv file list**: Show which files were loaded
2. **Secret count badge**: Display count of loaded secrets
3. **Reload button**: Reload dotenv files without reloading WASM
4. **File validation**: Show errors if dotenv files are malformed
5. **Secret preview**: Show secret keys (not values) in UI
6. **Environment selector**: Switch between .env.dev, .env.staging, etc.

---

**Status**: ✅ Fully implemented and ready for testing.

**Latest Updates (Feb 5, 2026)**:

- ✅ Created reusable Toggle component with folder structure pattern
- ✅ Implemented CSS Modules for cleaner styling
- ✅ Toggle component serves as reference for future component refactoring
- ✅ See `COMPONENT_STYLING_PATTERN.md` for component architecture details

**Next Steps**:

1. Build project: `pnpm build`
2. Create example dotenv files
3. Test toggle functionality
4. Test WASM secret/dictionary access
5. Update main documentation
