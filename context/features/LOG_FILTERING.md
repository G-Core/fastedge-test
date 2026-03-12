# Log Level Filtering Implementation

## Overview

Added log level filtering to the Proxy-WASM Runner to handle the G-Core SDK's use of WASI logging. The G-Core SDK uses `wasiLog()` instead of `proxy_log()`, which writes all logs to stdout via `fd_write`, bypassing traditional proxy-wasm log filtering.

## Changes Made

### 1. Backend Changes

#### HostFunctions.ts

- Added `LogLevel` enum with levels: Trace(0), Debug(1), Info(2), Warn(3), Error(4), Critical(5)
- Added `currentLogLevel` tracking (defaults to Trace to show all logs)
- Implemented `proxy_get_log_level` host function
- Implemented `proxy_set_log_level` host function
- Added `shouldLog(level)` method for filtering
- Modified `proxy_log` to filter based on current log level

#### MemoryManager.ts

- Updated `captureFdWrite()` to attempt parsing log level from WASI output
- Supports format: `[LEVEL] message` where LEVEL is TRACE, DEBUG, INFO, WARN, ERROR, or CRITICAL
- Falls back to level 1 (debug) if no level marker found

#### ProxyWasmRunner.ts

- Modified `callHook()` to accept `logLevel` parameter
- Sets log level before hook execution
- Filters logs before returning results

#### types.ts

- Added `logLevel?: number` to `HookCall` type

#### server.ts

- Updated `/api/call` endpoint to accept and pass `logLevel` from request body
- Defaults to level 2 (Info) if not specified

### 2. Frontend Changes

#### index.html

- Added log level selector dropdown in Hooks section
- Options: Trace, Debug, Info (default), Warn, Error, Critical
- Added explanatory text: "Only logs at or above this level will be shown"

#### app.js

- Added `logLevel` DOM reference
- Updated both "Run All Hooks" and individual hook handlers to include `logLevel` in payload
- Updated log display to include "critical" level

## Log Levels

| Level    | Value | Description                       |
| -------- | ----- | --------------------------------- |
| Trace    | 0     | Most verbose - shows everything   |
| Debug    | 1     | Debug information                 |
| Info     | 2     | **Default** - General information |
| Warn     | 3     | Warnings                          |
| Error    | 4     | Errors                            |
| Critical | 5     | Critical errors only              |

## Usage

### From UI

1. Select desired log level from dropdown (defaults to "Info")
2. Run hooks as normal
3. Only logs at or above the selected level will be displayed

### From API

```javascript
POST /api/call
{
  "hook": "onRequestHeaders",
  "request": { ... },
  "response": { ... },
  "properties": { ... },
  "logLevel": 2  // 0=trace, 1=debug, 2=info, 3=warn, 4=error, 5=critical
}
```

### From WASM (G-Core SDK)

The SDK automatically uses `wasiLog()` which the runner now captures and parses. If your WASM code uses:

```typescript
log(LogLevelValues.info, "onRequestHeaders >> info");
```

The runner will:

1. Capture the stdout output
2. Attempt to parse log level (if marked as `[INFO]` or similar)
3. Filter based on the current `logLevel` setting
4. Display only if level ≥ current filter level

## Example

With `logLevel=2` (Info), this WASM code:

```typescript
log(LogLevelValues.trace, "onRequestHeaders >> trace"); // Hidden
log(LogLevelValues.debug, "onRequestHeaders >> debug"); // Hidden
log(LogLevelValues.info, "onRequestHeaders >> info"); // ✓ Shown
log(LogLevelValues.warn, "onRequestHeaders >> warn"); // ✓ Shown
log(LogLevelValues.error, "onRequestHeaders >> error"); // ✓ Shown
log(LogLevelValues.critical, "onRequestHeaders >> critical"); // ✓ Shown
```

Would only show Info, Warn, Error, and Critical logs.

## Implementation Notes

1. **WASI Logging**: The G-Core SDK uses WASI `fd_write` for logging instead of `proxy_log`, so we capture and parse stdout
2. **Format Detection**: We attempt to detect log level markers like `[INFO]`, `[DEBUG]`, etc. in the output
3. **Default Level**: Set to Info (2) to hide verbose trace/debug output by default
4. **Backwards Compatible**: If no `logLevel` is specified, defaults to Info (2)
5. **Host Functions**: Both `proxy_get_log_level` and `proxy_set_log_level` are now implemented

## Testing

To test log filtering:

1. Load the `print-wasm-code` binary (which logs at all levels)
2. Change log level dropdown to different values
3. Run `onRequestHeaders`
4. Verify only appropriate logs appear

Expected results:

- **Trace**: See all 7 log messages (trace, debug, info, warn, error, critical, header print)
- **Info**: See 5 messages (info, warn, error, critical, header print)
- **Warn**: See 4 messages (warn, error, critical, header print)
- **Error**: See 3 messages (error, critical, header print)

## Future Enhancements

1. Add color coding for different log levels in the UI
2. Add per-hook log level override
3. Save log level preference to localStorage
4. Add regex filtering for log content
5. Add export logs functionality
