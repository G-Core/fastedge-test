import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResourceView, DEFAULT_RESOURCE_FILE } from "./ResourceView";
import * as api from "../../api";

vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  resource: { read: vi.fn(), save: vi.fn(), load: vi.fn(), send: vi.fn() },
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
    r.read.mockResolvedValue({ path: FULL, config: config() });
    r.save.mockResolvedValue(FULL);
    r.load.mockResolvedValue({ configPath: FULL, apps: [] });
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
    r.read.mockResolvedValue({ path: FULL, config: { ...config(), main: { hooks: { onRequestHeaders: "sso" }, origin: { app: "sso" } } } });
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
    r.read.mockResolvedValue({ path: FULL, config: null });
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
});
