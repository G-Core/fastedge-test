import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StorageExplorerView } from "./StorageExplorerView";
import { lineDiff } from "./SaveFixtures";
import * as api from "../../api";

vi.mock("../../api", () => ({
  getRequestContextPresets: vi.fn().mockResolvedValue({ client: {}, edge: { de: { dc: "fr5" }, nl: { dc: "am3" }, us: { dc: "sv5" } } }),
  getStoredValue: vi.fn(),
  storage: {
    snapshot: vi.fn(),
    value: vi.fn(),
    putKv: vi.fn().mockResolvedValue({}),
    deleteKv: vi.fn().mockResolvedValue({}),
    createStore: vi.fn().mockResolvedValue({}),
    deleteStore: vi.fn().mockResolvedValue({}),
    importKv: vi.fn().mockResolvedValue(2),
    putCache: vi.fn().mockResolvedValue({}),
    expireCache: vi.fn().mockResolvedValue(true),
    deleteCache: vi.fn().mockResolvedValue({}),
    reset: vi.fn().mockResolvedValue({}),
    advanceClock: vi.fn().mockResolvedValue({}),
    pauseClock: vi.fn().mockResolvedValue({}),
    fixturesDiff: vi.fn(),
    saveFixtures: vi.fn().mockResolvedValue(["fixtures/stores/kv/users.json"]),
  },
}));

const s = vi.mocked(api.storage);
const snapshot = {
  appDc: null as string | null,
  now: 1_000_000,
  clockPaused: false,
  dc: "local",
  dcs: ["local"],
  cache: [{ key: "page", size: 2, expiresAt: 1_000_000 + 60_000 }],
  kv: [{ store: "users", strings: [{ key: "alice", size: 16 }], zsets: [], bloom: [] }],
};

describe("StorageExplorerView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s.snapshot.mockResolvedValue(snapshot);
  });

  it("lists stores and keys, and adds a sorted set from 'score member' lines", async () => {
    render(<StorageExplorerView />);
    expect(await screen.findByText("alice")).toBeTruthy();
    fireEvent.click(screen.getByText("Add key"));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "zset" } });
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "rank" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1 alice\n2.5 bob\n" } });
    fireEvent.click(screen.getAllByText("Add key")[1]);
    await waitFor(() => expect(s.putKv).toHaveBeenCalledWith("users", "rank", { type: "zset", members: [["alice", 1], ["bob", 2.5]] }));
  });

  it("edits a key with its current value in the editor", async () => {
    s.value.mockResolvedValue({ type: "string", size: 16, value: btoa('{"role":"admin"}'), truncated: false });
    render(<StorageExplorerView />);
    fireEvent.click(await screen.findByText("alice"));
    fireEvent.click(await screen.findByText("Edit"));
    const box = (await screen.findByLabelText("Value")) as HTMLTextAreaElement;
    expect(box.value).toBe('{"role":"admin"}');
    fireEvent.change(box, { target: { value: '{"role":"user"}' } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(s.putKv).toHaveBeenCalledWith("users", "alice", { type: "string", value: '{"role":"user"}' }));
  });

  it("does not offer to edit a value it only has part of", async () => {
    s.value.mockResolvedValue({ type: "string", size: 9000, value: btoa("x".repeat(10)), truncated: true });
    render(<StorageExplorerView />);
    fireEvent.click(await screen.findByText("alice"));
    fireEvent.click(await screen.findByText("Edit"));
    expect(await screen.findByText(/too large \(or binary\) to edit here/)).toBeTruthy();
  });

  it("sets a cache entry's TTL", async () => {
    s.value.mockResolvedValue({ type: "string", size: 2, value: btoa("hi"), truncated: false, expiresAt: 1 });
    render(<StorageExplorerView />);
    fireEvent.click(await screen.findByText(/^Cache/));
    fireEvent.click(await screen.findByText("page"));
    fireEvent.change(await screen.findByLabelText("New TTL seconds"), { target: { value: "90" } });
    fireEvent.click(screen.getByText("Set TTL"));
    await waitFor(() => expect(s.expireCache).toHaveBeenCalledWith("local", "page", 90_000));
  });

  it("saves to fixtures what the diff showed; deletions are opt-in", async () => {
    s.fixturesDiff.mockResolvedValue({
      root: "/repo",
      changes: [
        { store: "old", file: "fixtures/stores/kv/old.json", status: "deleted", current: "{}\n", proposed: null, hash: "h1" },
        { store: "users", file: "fixtures/stores/kv/users.json", status: "new", current: null, proposed: '{\n  "strings": {}\n}\n', hash: "h2" },
      ],
    });
    render(<StorageExplorerView />);
    fireEvent.click(await screen.findByText("Save…"));
    expect(await screen.findByText("Save 1 file")).toBeTruthy();
    fireEvent.click(screen.getByText("Save 1 file"));
    await waitFor(() => expect(s.saveFixtures).toHaveBeenCalledWith([{ file: "fixtures/stores/kv/users.json", hash: "h2" }]));
    expect(await screen.findByText(/Saved fixtures\/stores\/kv\/users.json/)).toBeTruthy();
  });

  it("opens the cache on the loaded app's dc", async () => {
    s.snapshot.mockResolvedValue({ ...snapshot, appDc: "fr5", dc: "fr5", dcs: ["fr5"] });
    render(<StorageExplorerView />);
    fireEvent.click(await screen.findByText(/^Cache/));
    await waitFor(() => expect(screen.getByRole("combobox").textContent).toContain("fr5 (this app)"));
    expect(s.snapshot).toHaveBeenCalledWith(null);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "am3" } });
    await waitFor(() => expect(s.snapshot).toHaveBeenLastCalledWith("am3"));
  });

  it("pauses the clock", async () => {
    render(<StorageExplorerView />);
    fireEvent.click(await screen.findByText("⏸ Pause clock"));
    await waitFor(() => expect(s.pauseClock).toHaveBeenCalledWith(true));
  });
});

describe("lineDiff", () => {
  it("marks removed and added lines", () => {
    expect(lineDiff("a\nb\nc\n", "a\nc\nd\n")).toEqual([
      { op: " ", line: "a" },
      { op: "-", line: "b" },
      { op: " ", line: "c" },
      { op: "+", line: "d" },
    ]);
  });

  it("keeps common lines and shows a too-large middle as replaced", () => {
    const before = ["head", ...Array.from({ length: 3000 }, (_, i) => `old ${i}`), "tail"].join("\n");
    const after = ["head", ...Array.from({ length: 3000 }, (_, i) => `new ${i}`), "tail"].join("\n");
    const diff = lineDiff(before, after);
    expect(diff[0]).toEqual({ op: " ", line: "head" });
    expect(diff[diff.length - 1]).toEqual({ op: " ", line: "tail" });
    expect(diff.filter((d) => d.op === "-")).toHaveLength(3000);
    expect(diff.filter((d) => d.op === "+")).toHaveLength(3000);
  });
});
