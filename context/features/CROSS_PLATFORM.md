# Cross-Platform Support

## Target Platforms

This package must run correctly on all three platforms:

| Platform | Node identifier | CLI binary |
|----------|----------------|------------|
| Linux x64 | `linux` | `fastedge-run-linux-x64` |
| macOS ARM64 | `darwin` | `fastedge-run-darwin-arm64` |
| Windows x64 | `win32` | `fastedge-run.exe` |

The GitHub Actions release pipeline builds and packages for all three. The distributed npm package (`@gcoredev/fastedge-test`) must work on all three out of the box.

**Dev workflow** (`pnpm run dev`) is Linux/macOS only — Windows developer support is not a current requirement.

---

## Platform Detection

Use `process.platform` or `os.platform()` for runtime branching. Both return the same value.

```typescript
import os from "os";
os.platform(); // "linux" | "darwin" | "win32"
// or
process.platform; // same values
```

The canonical platform detection for CLI binary selection is in `server/utils/fastedge-cli.ts` — see `getCliBinaryName()`. Follow the same switch pattern if you need to branch on platform elsewhere.

---

## Rules for New Code

### File Paths — always use `path` module

```typescript
// ✅ correct
import path from "node:path";
path.join(dir, "subdir", "file.txt");
path.resolve(__dirname, "../config");

// ❌ wrong — breaks on Windows
dir + "/" + file;
`${dir}\\${file}`;
```

### Temp files — always use `os.tmpdir()`

```typescript
// ✅ correct
import { tmpdir } from "os";
const tmp = path.join(tmpdir(), "myfile.tmp");

// ❌ wrong
const tmp = `/tmp/myfile.tmp`;
```

### Process spawning — `spawn()` is cross-platform safe

Node.js `child_process.spawn()` works on all platforms. Avoid `exec()` with shell commands that contain Unix-specific syntax (`&&`, `|`, `&`, etc.) in production code — only acceptable in dev-only scripts.

### Process signals — SIGINT first, platform-specific force-kill fallback

```typescript
// ✅ correct pattern (HttpWasmRunner.killProcess)
this.process.kill("SIGINT"); // works on all platforms via Node.js translation

// timeout fallback:
if (process.platform === "win32") {
  execSync(`taskkill /F /T /PID ${pid}`); // terminates process tree
} else {
  this.process.kill("SIGKILL");
}
```

Do **not** use `SIGTERM` for child process termination — it is not reliably sent on Windows.

### Shell scripts in package.json

Dev-only scripts (`dev:*`) may use Unix shell syntax (`sleep`, `&&`). Production scripts (`build:*`, `start`, `test:*`) must be cross-platform. Use `npm-run-all2` (`run-p`, `run-s`) for orchestration instead of `&` or `&&`.

### Port file / graceful shutdown

The server writes a `.fastedge-debug/.debug-port` file on startup and deletes it on shutdown. Windows does not send `SIGTERM`, so `SIGTERM`/`SIGINT` signal handlers alone are insufficient for cleanup. Always pair signal handlers with a `process.on("exit")` handler:

```typescript
// Covers Windows where SIGTERM is never sent
process.on("exit", () => {
  deletePortFile();
});
```

The `exit` event fires for normal exits and unhandled exceptions on all platforms. It does **not** fire after a hard `TerminateProcess` — that is acceptable since the VSCode extension validates port file health on startup.

**WORKSPACE_PATH default (April 2026)**: `getPortFilePath()` defaults `WORKSPACE_PATH` to `process.cwd()`, so CLI users get port files and config resolution too (previously only set by the VSCode extension).

**Port auto-increment (April 2026)**: `startServer()` probes ports 5179-5228 via HTTP `/health` check before binding (50 slots, expanded from 10 on 2026-04-22 for Codespaces / multi-session workflows). If a port is busy, tries the next one. This logic was moved from the VSCode extension's `DebuggerServerManager.resolvePort()` into the server itself.

---

## What Is Already Handled

| Concern | Location | Status |
|---------|----------|--------|
| CLI binary selection | `server/utils/fastedge-cli.ts:getCliBinaryName()` | ✅ |
| `chmod` skip on win32 | `server/utils/fastedge-cli.ts:ensureExecutable()` | ✅ |
| `where` vs `which` | `server/utils/fastedge-cli.ts` | ✅ |
| File path handling | Throughout — `path.join()` used consistently | ✅ |
| Temp files | `server/utils/temp-file-manager.ts` | ✅ |
| Port scanning | `server/runner/PortManager.ts` | ✅ |
| WASM loading | `WebAssembly` API — platform-agnostic | ✅ |
| Child process kill | `server/runner/HttpWasmRunner.ts:killProcess()` | ✅ |
| Port file cleanup | `server/server.ts` — signal handlers + `exit` event | ✅ |
| CI matrix | `.github/workflows/download-cli.yml` | ✅ |

---

## Known Limitations

- **`dev:backend` script**: Uses `sleep 2` (Unix only). Windows developers must run `dev:backend:esbuild` and `dev:backend:server` manually in separate terminals.
- **Hard kill (TerminateProcess)**: A `.fastedge-debug/.debug-port` file may persist after a hard kill on Windows. The server's port auto-increment probes via `/health` check, so stale port files do not cause port collisions.
