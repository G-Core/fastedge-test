import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StoresPanel } from "./StoresPanel";
import * as api from "../../../api";

vi.mock("../../../api", () => ({
  getStoresSnapshot: vi.fn(),
  getStoredValue: vi.fn(),
  getRequestContextPresets: vi.fn().mockResolvedValue({
    client: {},
    edge: { de: { dc: "fr5" }, nl: { dc: "am3" }, us: { dc: "sv5" } },
  }),
  resetStores: vi.fn().mockResolvedValue(undefined),
  advanceStoresClock: vi.fn().mockResolvedValue(undefined),
}));

const snapshot = (dc = "fr5") => ({
  enabled: true as const,
  appDc: "fr5",
  now: 1_000_000,
  dc,
  dcs: ["am3", "fr5"],
  cache: dc === "fr5" ? [{ key: "page:/", size: 12, expiresAt: 1_000_000 + 90_000 }] : [],
  kv: [{ store: "users", strings: [{ key: "alice", size: 5 }], zsets: [{ key: "scores", members: 3 }], bloom: [] }],
});

function open(refreshKey: unknown = 1) {
  const view = render(<StoresPanel refreshKey={refreshKey} />);
  fireEvent.click(screen.getByText("Storage"));
  return view;
}

describe("StoresPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getStoresSnapshot).mockImplementation(async (dc) => snapshot(dc ?? "fr5"));
  });

  it("shows cache entries with TTL and KV keys by type", async () => {
    open();
    expect(await screen.findByText("page:/")).toBeTruthy();
    expect(screen.getByText("1m 30s")).toBeTruthy();
    expect(screen.getByText("alice")).toBeTruthy();
    expect(screen.getByText("3 members")).toBeTruthy();
    // Preset POPs get their country's flag.
    await waitFor(() => expect(screen.getByRole("combobox").textContent).toContain("🇩🇪 fr5 (this app)"));
    expect(screen.getByRole("combobox").textContent).toContain("🇳🇱 am3");
  });

  it("switches dc, resets, advances the clock, and refreshes after a request", async () => {
    const view = open();
    await screen.findByText("page:/");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "am3" } });
    await waitFor(() => expect(api.getStoresSnapshot).toHaveBeenLastCalledWith("am3"));
    expect(await screen.findByText("No entries in am3.")).toBeTruthy();

    fireEvent.click(screen.getByText("Reset"));
    await waitFor(() => expect(api.resetStores).toHaveBeenCalled());
    fireEvent.click(screen.getByText("+1 h"));
    await waitFor(() => expect(api.advanceStoresClock).toHaveBeenCalledWith(3_600_000));

    const calls = vi.mocked(api.getStoresSnapshot).mock.calls.length;
    view.rerender(<StoresPanel refreshKey={2} />);
    await waitFor(() => expect(vi.mocked(api.getStoresSnapshot).mock.calls.length).toBe(calls + 1));
  });

  it("says when stores are off", async () => {
    vi.mocked(api.getStoresSnapshot).mockResolvedValue({ enabled: false });
    open();
    expect(await screen.findByText(/Stores are off/)).toBeTruthy();
  });

  it("opens a row to show its value: JSON text, binary, sorted set members, gone", async () => {
    const b64 = (text: string) => btoa(text);
    const values = vi.mocked(api.getStoredValue);
    values.mockResolvedValueOnce({ type: "string", size: 13, value: b64('{"a":[1,2]}'), truncated: false, expiresAt: 1 });
    open();
    fireEvent.click(await screen.findByText("page:/"));
    await waitFor(() => expect(values).toHaveBeenCalledWith({ dc: "fr5" }, "page:/"));
    expect((await screen.findByText(/"a": \[/)).textContent).toContain('"a": [\n    1,');

    values.mockResolvedValueOnce({ type: "string", size: 3, value: btoa("\xff\xfe\x00"), truncated: false });
    fireEvent.click(screen.getByText("alice"));
    expect(await screen.findByText("binary (base64)")).toBeTruthy();
    expect(values).toHaveBeenLastCalledWith({ store: "users" }, "alice");

    // A cut value: an incomplete last character is fine, invalid bytes before it are binary.
    values.mockResolvedValueOnce({ type: "string", size: 9000, value: btoa("\xff\xfeabc"), truncated: true });
    fireEvent.click(screen.getByText("alice"));
    fireEvent.click(screen.getByText("alice"));
    expect(await screen.findByText("binary (base64)")).toBeTruthy();

    values.mockResolvedValueOnce({
      type: "zset",
      count: 3,
      members: [{ size: 2, value: b64("m1"), truncated: false, score: 1.5 }],
    });
    fireEvent.click(screen.getByText("scores"));
    expect(await screen.findByText("m1")).toBeTruthy();
    expect(screen.getByText("1.5")).toBeTruthy();
    expect(screen.getByText("first 1 of 3 members")).toBeTruthy();

    // Clicking again closes it; reopening a deleted entry says so.
    fireEvent.click(screen.getByText("scores"));
    expect(screen.queryByText("m1")).toBeNull();
    values.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByText("scores"));
    expect(await screen.findByText("Gone (deleted or expired).")).toBeTruthy();
  });

  it("keeps a failed action's error after the refresh", async () => {
    vi.mocked(api.resetStores).mockRejectedValueOnce(new Error("bad fixture"));
    open();
    await screen.findByText("page:/");
    fireEvent.click(screen.getByText("Reset"));
    expect(await screen.findByText("bad fixture")).toBeTruthy();
  });

  it("refreshes when the next cache entry expires", async () => {
    vi.mocked(api.getStoresSnapshot)
      .mockResolvedValueOnce({ ...snapshot(), cache: [{ key: "soon", size: 1, expiresAt: 1_000_000 + 50 }] })
      .mockResolvedValue({ ...snapshot(), cache: [] });
    open();
    expect(await screen.findByText("soon")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("soon")).toBeNull(), { timeout: 2000 });
  });
});
