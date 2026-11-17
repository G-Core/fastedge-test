# Log Level Filtering Implementation

## Overview

Log level filtering in the Proxy-WASM runner exists to handle the G-Core SDK's use of WASI logging. The G-Core SDK uses `wasiLog()` instead of `proxy_log()`, which writes all logs to stdout via `fd_write`, bypassing traditional proxy-wasm log filtering.

## How it works

### Capture (server)

- `HostFunctions.ts`: `LogLevel` enum Trace(0) … Critical(5). `proxy_get_log_level` /
  `proxy_set_log_level` are implemented; the host level defaults to Trace, so the server keeps
  every log line.
- `MemoryManager.captureFdWrite()`: WASI stdout/stderr lines are captured as logs. A leading
  `[TRACE]` / `[DEBUG]` / `[INFO]` / `[WARN]` / `[ERROR]` / `[CRITICAL]` marker sets the level;
  without one the line is Debug (1).
- The server does not filter: every log goes to the client with its level.

### Filter (UI)

- `LogLevelSelector` sets `logLevel` in the config slice (default Info, 2); it is saved in and
  restored from config files.
- `LogsViewer` shows only entries with `level >= logLevel`, color-coded by level.

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

Select the level in the logs panel; only logs at or above it are shown. Changing it re-filters the
logs already received, without re-running the request.

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
3. **Default Level**: The UI starts at Info (2) to hide verbose trace/debug output
4. **Host Functions**: `proxy_get_log_level` and `proxy_set_log_level` are implemented

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
