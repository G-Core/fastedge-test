/**
 * Origin mocking for tests — a thin lifecycle wrapper around undici's MockAgent.
 *
 * The runner's origin fetch (inside callFullFlow) and every proxy_http_call
 * upstream fetch both go through Node's global fetch, which routes through
 * undici's global dispatcher. Replacing the dispatcher with a MockAgent
 * intercepts all of them. This helper installs the MockAgent, disables real
 * network connections by default, and restores the previous dispatcher on
 * close().
 *
 * The returned handle exposes the raw MockAgent as an escape hatch so
 * advanced undici features (delays, .persist(), .times(), body matching, etc.)
 * remain available without the wrapper having to re-export them.
 */

import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  type Dispatcher,
  type MockPool,
} from "undici";

export interface MockOriginsOptions {
  /**
   * Control whether unmocked requests can reach the real network.
   *
   * - `false` (default): block everything except what's mocked. Unmocked
   *   requests throw. Safer — missing mocks become loud failures rather
   *   than silent live calls in CI.
   * - `true`: allow all unmocked requests to hit the network.
   * - `(string | RegExp)[]`: block everything, then allow-list specific
   *   origins or patterns. Use this for HTTP-WASM tests, where the runner
   *   forwards to a spawned `fastedge-run` on localhost that the mock
   *   dispatcher must not intercept (e.g. `[/^127\.0\.0\.1/, /^localhost/]`).
   */
  allowNetConnect?: boolean | (string | RegExp)[];
}

export interface MockOriginsHandle {
  /**
   * Get or create a MockPool for the given origin URL. Chain
   * `.intercept({ path, method, ... }).reply(status, body)` on the returned
   * pool to register a mock. Despite the name, `method` defaults to `GET`
   * and accepts any HTTP verb (string, RegExp, or predicate function).
   */
  origin(url: string): MockPool;
  /**
   * The raw undici MockAgent — escape hatch for advanced features not
   * exposed by the wrapper (`.persist()`, `.times(n)`, `.delay(ms)`,
   * custom body matchers, etc.).
   */
  readonly agent: MockAgent;
  /**
   * Close the MockAgent and restore the previous global dispatcher. Safe
   * to call multiple times; later calls are no-ops.
   */
  close(): Promise<void>;
  /**
   * Throw if any registered interceptor was never called. Run this in
   * `afterEach` to catch tests that set up mocks they never exercised.
   */
  assertAllCalled(): void;
}

export function mockOrigins(opts?: MockOriginsOptions): MockOriginsHandle {
  const previous: Dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();

  const allow = opts?.allowNetConnect;
  if (allow === true) {
    // All origins may reach the real network unless mocked.
  } else {
    agent.disableNetConnect();
    if (Array.isArray(allow)) {
      for (const pattern of allow) {
        agent.enableNetConnect(pattern);
      }
    }
  }

  setGlobalDispatcher(agent);

  let closed = false;
  return {
    origin: (url: string) => agent.get(url),
    agent,
    async close() {
      if (closed) return;
      closed = true;
      await agent.close();
      setGlobalDispatcher(previous);
    },
    assertAllCalled() {
      agent.assertNoPendingInterceptors();
    },
  };
}
