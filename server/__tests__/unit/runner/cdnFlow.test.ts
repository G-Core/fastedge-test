import { describe, it, expect } from "vitest";
import { runCdnFlow, type CdnFlowHost, type CdnHook, type FlowHookRunner } from "../../../runner/cdnFlow";
import type { HookCall, HookResult } from "../../../runner/types";

/** A runner that echoes its call, adding x-<hook>: <name> to the request or response headers. */
const marker = (name: string): FlowHookRunner => ({
  async callHook(call: HookCall): Promise<HookResult> {
    const response = call.response ?? { headers: {}, body: "" };
    const request = { headers: call.request.headers, body: call.request.body };
    const output = call.hook.startsWith("onRequest")
      ? { request: { ...request, headers: { ...request.headers, [`x-${call.hook}`]: name } }, response }
      : { request, response: { ...response, headers: { ...response.headers, [`x-${call.hook}`]: name } } };
    return { returnCode: 0, logs: [], input: { request, response }, output, properties: call.properties };
  },
});
const trapping: FlowHookRunner = { callHook: async () => { throw new Error("unreachable"); } };

const host = (runners: Partial<Record<CdnHook, FlowHookRunner>>, onHookError?: CdnFlowHost["onHookError"]): CdnFlowHost => ({
  runnerFor: (hook) => runners[hook],
  start: () => {},
  calculatedProperties: () => ({}),
  log: () => {},
  onHookError,
});
const call = (): HookCall => ({ hook: "", request: { headers: {}, body: "" }, properties: {} });

describe("runCdnFlow", () => {
  it("skips hooks without an app and passes the request through", async () => {
    const result = await runCdnFlow(host({ onRequestHeaders: marker("a"), onResponseBody: marker("b") }), call(), "built-in");
    expect(Object.keys(result.hookResults)).toEqual(["onRequestHeaders", "onResponseBody"]);
    expect(JSON.parse(result.finalResponse.body).reqHeaders["x-onRequestHeaders"]).toBe("a");
    expect(result.finalResponse.headers["x-onResponseBody"]).toBe("b");
  });

  it("a trap with interrupt_on_error ends the request with 531", async () => {
    const result = await runCdnFlow(host({ onRequestHeaders: trapping, onResponseBody: marker("b") }, () => "interrupt"), call(), "built-in");
    expect(result.finalResponse.status).toBe(531);
    expect(result.hookResults.onRequestHeaders.logs[0].message).toContain("onRequestHeaders failed: unreachable");
    expect(result.hookResults.onResponseBody).toBeUndefined();
  });

  it("a trap without interrupt_on_error goes on as if the hook had not run", async () => {
    const result = await runCdnFlow(host({ onResponseHeaders: trapping, onResponseBody: marker("b") }, () => "continue"), call(), "built-in");
    expect(result.finalResponse.status).toBe(200);
    expect(result.finalResponse.headers["x-onResponseBody"]).toBe("b");
    expect(result.hookResults.onResponseHeaders.returnCode).toBeNull();
  });

  it("without an error handler a trap propagates (single app)", async () => {
    await expect(runCdnFlow(host({ onRequestHeaders: trapping }), call(), "built-in")).rejects.toThrow("unreachable");
  });
});
