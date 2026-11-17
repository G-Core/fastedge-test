import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResourceView, DEFAULT_RESOURCE_FILE, relativePath } from "./ResourceView";
import * as api from "../../api";

vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  resource: { read: vi.fn(), save: vi.fn(), load: vi.fn(), send: vi.fn(), files: vi.fn() },
}));

const r = vi.mocked(api.resource);
const FULL = `/ws/${DEFAULT_RESOURCE_FILE}`;
const config = (): api.ResourceConfig => ({
  apps: { sso: { config: "../sso/fastedge-config.test.json" }, totp: { wasm: "../totp.wasm" } },
  main: { hooks: { onRequestHeaders: "sso" }, origin: { url: "https://origin.example" } },
  rules: [{ name: "totp", match: "^/totp", hooks: { onRequestHeaders: "totp" } }],
  properties: { "request.country": "LU" },
});

describe("ResourceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    r.read.mockResolvedValue({ path: FULL, config: config(), version: "v1" });
    r.save.mockResolvedValue({ path: FULL, version: "v2" });
    r.send.mockResolvedValue({ rule: null, hooks: {}, finalResponse: { status: 200, statusText: "OK", headers: {}, body: "", contentType: "text/plain" } });
    r.load.mockResolvedValue({ configPath: FULL, apps: [] });
    r.files.mockResolvedValue({
      root: "/ws",
      wasm: ["apps/edge/target/wasm32-wasip1/release/edge.wasm"],
      configs: [DEFAULT_RESOURCE_FILE, "apps/edge/fixtures/one.test.json"],
      dotenvDirs: ["apps/edge/fixtures"],
      folders: [],
      files: [],
      truncated: false,
    });
  });

  it("opens the default file and saves hook edits, keeping fields it does not edit", async () => {
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    expect(await screen.findByLabelText("sso config")).toBeTruthy();
    expect(r.read).toHaveBeenCalledWith(DEFAULT_RESOURCE_FILE);

    fireEvent.change(screen.getByLabelText("main onResponseBody"), { target: { value: "totp" } });
    // Unticked interrupt: the object form.
    fireEvent.click(screen.getAllByLabelText(/interrupt on error/)[3]);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(r.save).toHaveBeenCalled());
    const saved = r.save.mock.calls[0][1];
    expect(saved.main.hooks).toEqual({ onRequestHeaders: "sso", onResponseBody: { app: "totp", interruptOnError: false } });
    expect(saved.properties).toEqual({ "request.country": "LU" });
  });

  it("removing an app takes it off every hook and origin", async () => {
    r.read.mockResolvedValue({ path: FULL, config: { ...config(), main: { hooks: { onRequestHeaders: "sso" }, origin: { app: "sso" } } }, version: "v1" });
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    await screen.findByLabelText("sso config");
    fireEvent.click(screen.getAllByText("Remove")[0]);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(r.save).toHaveBeenCalled());
    const saved = r.save.mock.calls[0][1];
    expect(Object.keys(saved.apps)).toEqual(["totp"]);
    expect(saved.main).toEqual({ hooks: {}, origin: { url: "built-in" } });
  });

  it("starts a new resource when there is no file, then saves and loads it", async () => {
    r.read.mockResolvedValue({ path: FULL, config: null, version: null });
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    fireEvent.click(await screen.findByText("New resource"));
    fireEvent.change(screen.getByLabelText("New app name"), { target: { value: "edge" } });
    fireEvent.click(screen.getByText("Add app"));
    fireEvent.change(screen.getByLabelText("edge wasm"), { target: { value: "../edge.wasm" } });
    fireEvent.click(screen.getByText("Save and load"));
    await waitFor(() => expect(r.load).toHaveBeenCalledWith(DEFAULT_RESOURCE_FILE));
    expect(r.save.mock.calls[0][1].apps).toEqual({ edge: { wasm: "../edge.wasm" } });
  });

  it("shows the flow: which app ran each hook, and what a hook did", async () => {
    const result: api.ResourceResult = {
      rule: { index: 0, name: "totp", match: "^/totp" },
      hooks: {
        onRequestHeaders: {
          app: "totp",
          result: {
            returnCode: 1,
            logs: [{ level: 2, message: "asking for a code" }],
            input: { request: { headers: {}, body: "" }, response: { headers: {}, body: "" } },
            output: { request: { headers: {}, body: "" }, response: { headers: {}, body: "" } },
            localResponse: { status: 401 },
          },
        },
      },
      finalResponse: { status: 401, statusText: "Unauthorized", headers: {}, body: "", contentType: "text/plain" },
    };
    render(<ResourceView loaded={{ configPath: FULL, apps: [{ name: "totp", wasmType: "proxy-wasm" }] }} result={result} onResult={vi.fn()} />);
    expect(await screen.findByText("rule 1 (totp): ^/totp")).toBeTruthy();
    expect(screen.getByText("sent 401")).toBeTruthy();
    expect(screen.getByText("not reached")).toBeTruthy();
    expect(screen.getByText(/asking for a code/)).toBeTruthy();
  });

  it("suggests workspace files relative to the resource file, and saves a dotenv path", async () => {
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    const wasm = await screen.findByLabelText("totp wasm");
    fireEvent.focus(wasm);
    await waitFor(() => expect(document.querySelector("#rv-wasm option")).toBeTruthy());
    const values = (id: string) => [...document.querySelectorAll(`#${id} option`)].map((o) => o.getAttribute("value"));
    expect(wasm.getAttribute("list")).toBe("rv-wasm");
    expect(values("rv-wasm")).toEqual(["../apps/edge/target/wasm32-wasip1/release/edge.wasm"]);
    expect(values("rv-configs")).toEqual(["fastedge-cdn-resource.test.json", "../apps/edge/fixtures/one.test.json"]);
    expect(values("rv-resource-files")).toEqual([DEFAULT_RESOURCE_FILE, "apps/edge/fixtures/one.test.json"]);

    fireEvent.click(screen.getByLabelText("totp dotenv"));
    fireEvent.change(screen.getByLabelText("totp dotenv path"), { target: { value: "../apps/edge/fixtures" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(r.save).toHaveBeenCalled());
    expect(r.save.mock.calls[0][1].apps.totp).toEqual({ wasm: "../totp.wasm", dotenv: { enabled: true, path: "../apps/edge/fixtures" } });
  });

  it("relativePath walks up and down from the resource file's folder", () => {
    expect(relativePath(".fastedge-debug", "app/x.wasm")).toBe("../app/x.wasm");
    expect(relativePath("", "app/x.wasm")).toBe("app/x.wasm");
    expect(relativePath("a/b", "a/c/d")).toBe("../c/d");
    expect(relativePath("app/fixtures", "app/fixtures")).toBe(".");
    expect(relativePath(".", ".")).toBe(".");
  });

  it("groups the flow's steps by app and shows a hook's detail as in the Debugger", async () => {
    const state = (h: Record<string, string>) => ({ request: { headers: h, body: "" }, response: { headers: {}, body: "" } });
    const hookResult = (message: string, level: number) => ({
      returnCode: 0,
      logs: [{ level, message }],
      input: state({}),
      output: state({ "image-format": "image/avif" }),
    });
    const result: api.ResourceResult = {
      rule: null,
      hooks: {
        onRequestHeaders: { app: "reqh", result: hookResult("scheduled", 2) },
        onResponseHeaders: { app: "resp", result: hookResult("headers set", 2) },
        onResponseBody: {
          app: "resp",
          result: { ...hookResult("trace detail", 0), output: { request: { headers: {}, body: "" }, response: { headers: {}, body: "AAEC", isBase64: true } } },
        },
      },
      origin: { kind: "url", response: { status: 200, headers: {}, body: "" } },
      finalResponse: { status: 200, statusText: "OK", headers: {}, body: "", contentType: "image/avif" },
    };
    render(<ResourceView loaded={{ configPath: FULL, apps: [] }} result={result} onResult={vi.fn()} />);
    await screen.findByLabelText("Flow");
    const groups = [...screen.getByLabelText("Flow").children].map((g) => [g.getAttribute("aria-label"), g.querySelectorAll("[role=tab]").length]);
    expect(groups).toEqual([["reqh", 1], ["not run", 1], ["origin: url", 1], ["resp", 2]]);

    expect(screen.getByText(/scheduled/)).toBeTruthy();
    fireEvent.click(screen.getByText("Outputs"));
    expect(screen.getByText("Request Headers (Modified)")).toBeTruthy();

    // The Debugger's log level applies: a TRACE log is hidden at the default level (INFO).
    fireEvent.click(screen.getAllByRole("tab", { name: /onResponseBody/ })[0]);
    expect(screen.queryByText(/trace detail/)).toBeNull();
    expect(screen.getByText(/No logs at this level/)).toBeTruthy();
    fireEvent.click(screen.getByText("Outputs"));
    expect(screen.getByText("Response Body (Modified): binary, 3 bytes (shown as base64)")).toBeTruthy();
  });

  it("opening another file takes that file's request", async () => {
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    await screen.findByLabelText("sso config");
    r.read.mockResolvedValue({ path: "/ws/other.json", config: { ...config(), request: { url: "https://example.com/shadow.png" } }, version: "v9" });
    fireEvent.change(screen.getByLabelText("Resource file"), { target: { value: "other.json" } });
    fireEvent.click(screen.getByText("Open"));
    expect(await screen.findByDisplayValue("https://example.com/shadow.png")).toBeTruthy();
  });

  it("Send saves and loads the edits first; unchanged, it only sends", async () => {
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    await screen.findByLabelText("sso config");
    expect(screen.getByRole("button", { name: "Load and send" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("main onResponseBody"), { target: { value: "totp" } });
    fireEvent.click(screen.getByRole("button", { name: "Save, load and send" }));
    await waitFor(() => expect(r.send).toHaveBeenCalled());
    expect(r.save.mock.calls[0][2]).toEqual({ expectedVersion: "v1" });
    expect(r.save.mock.invocationCallOrder[0]).toBeLessThan(r.load.mock.invocationCallOrder[0]);
    expect(r.load.mock.invocationCallOrder[0]).toBeLessThan(r.send.mock.invocationCallOrder[0]);
  });

  it("asks before overwriting a file changed on disk", async () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    await screen.findByLabelText("sso config");
    fireEvent.change(screen.getByLabelText("main onResponseBody"), { target: { value: "totp" } });

    r.save.mockRejectedValueOnce(new api.ResourceConflictError("changed", "v3"));
    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText(/Not saved: the file changed on disk/)).toBeTruthy();
    expect(r.save).toHaveBeenCalledTimes(1);

    r.save.mockRejectedValueOnce(new api.ResourceConflictError("changed", "v3"));
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(r.save).toHaveBeenCalledTimes(3));
    expect(r.save.mock.calls[2][2]).toEqual({ force: true });
    confirm.mockRestore();
  });

  it("reloads the file when it is saved elsewhere, or warns when there are unsaved edits", async () => {
    const { rerender } = render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    await screen.findByLabelText("sso config");
    expect(r.read).toHaveBeenCalledTimes(1);
    rerender(<ResourceView loaded={null} result={null} onResult={vi.fn()} saved={{ configPath: FULL, version: "agent-1" }} />);
    expect(await screen.findByText("Reloaded: the file was saved elsewhere.")).toBeTruthy();
    expect(r.read).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText("main onResponseBody"), { target: { value: "totp" } });
    rerender(<ResourceView loaded={null} result={null} onResult={vi.fn()} saved={{ configPath: FULL, version: "agent-2" }} />);
    expect(await screen.findByText(/saved elsewhere while you have unsaved edits/)).toBeTruthy();
    expect(r.read).toHaveBeenCalledTimes(2);
  });

  it("will not save or send an origin folder that is empty", async () => {
    render(<ResourceView loaded={null} result={null} onResult={vi.fn()} />);
    await screen.findByLabelText("sso config");
    fireEvent.change(screen.getByLabelText("main origin"), { target: { value: "files" } });
    expect(screen.getByText("Origin: choose the folder to serve.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save, load and send" }));
    expect(await screen.findByText("Not saved: main origin: choose the folder to serve.")).toBeTruthy();
    expect(r.save).not.toHaveBeenCalled();
    expect(r.send).not.toHaveBeenCalled();
  });
});
