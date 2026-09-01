# SA-006 — Unbounded synchronous WASM execution hangs the server (DoS)

**Severity:** Medium
**Category:** Uncontrolled resource consumption / missing execution isolation
(CWE-400, CWE-834)
**Status:** Open
**Affected files:** `server/runner/ProxyWasmRunner.ts` (WASM export invocation),
`server/runner/HttpWasmRunner.ts`, `server/server.ts:142` (`/api/load`),
`:305` (`/api/execute`)

## Summary

Loaded WASM is instantiated and its exports are invoked **synchronously in the
main Node process**, with **no fuel/epoch metering, no execution deadline, no
worker/child isolation, and no termination path**. The only timeout in the runner
is `AbortSignal.timeout(pending.timeoutMs)` at `ProxyWasmRunner.ts:977` — that
bounds an **outbound `http_call` fetch**, not the WASM's own execution.

A WASM module containing an infinite loop (or a pathological allocation) therefore
**permanently blocks the Node event loop**: the server stops answering `/health`,
every other `/api/*` request, and all WebSocket traffic, and there is no way to
interrupt it short of killing the process. A few bytes of WASM
(`loop { }`) is enough.

Chained with **SA-001** (unauthenticated, network-reachable), this is
**remotely triggerable** — a single `POST /api/load` with a tiny malicious
`wasmBase64` hangs the developer's debugger server.

## Impact

- **Availability:** trivial, permanent denial of service of the debugger from one
  request; remote/rebinding/local reachable via SA-001. No data impact. Medium
  (High availability, but bounded to this dev tool).

## Remediation

The robust fix is **execution isolation with a hard deadline** — a byte-size cap
(SA-003 step 3) does **not** help, since the danger is CPU time, not input size.

1. **Run WASM in a `worker_threads` Worker (or child process)** dedicated to the
   current module, and enforce a **wall-clock deadline** per invocation. On
   timeout, **terminate the worker** (`worker.terminate()`) and return a 504/500
   to the caller, then require a fresh `/api/load`. This is the only way to
   interrupt a runaway synchronous WASM loop in Node — you cannot cancel it on the
   main thread.
2. If the runtime supports it, also enable engine-level metering (fuel/epoch
   interruption) as a second layer, but do not rely on it alone.
3. Bound concurrency (one in-flight execution at a time is already implied by the
   single `currentRunner`); ensure a hung run can't wedge the accept loop — with
   a worker, the main thread stays responsive and can time the run out.
4. Gate `/api/load` and `/api/execute` behind the SA-001 token so this isn't
   remotely triggerable in the first place.

## Test

- Load a WASM module with an infinite loop and invoke it via `/api/execute`;
  assert the call returns a timeout error within the deadline **and** that
  `/health` still responds during and after (proving the main event loop was
  never blocked).

## Related

- SA-001 (remote reachability), SA-003 (the `wasmBase64` load path this abuses).
