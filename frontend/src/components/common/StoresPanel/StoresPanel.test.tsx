import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StoresPanel } from "./StoresPanel";
import * as api from "../../../api";

vi.mock("../../../api", () => ({
  getStoresSnapshot: vi.fn(),
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
  fireEvent.click(screen.getByText("Stores"));
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
});
