import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WasmLoader } from "./WasmLoader";
import * as api from "../../../api";

vi.mock("../../../api", async (original) => ({
  ...(await original<typeof import("../../../api")>()),
  resource: { files: vi.fn() },
}));

describe("WasmLoader file path", () => {
  it("suggests the workspace's wasm files as full paths and loads the chosen one", async () => {
    vi.mocked(api.resource.files).mockResolvedValue({
      root: "/ws",
      wasm: [".fastedge-debug/app.wasm", "app/target/wasm32-wasip1/release/app.wasm"],
      configs: [],
      dotenvDirs: [],
      folders: [],
      files: [],
      truncated: false,
    });
    const onPathLoad = vi.fn();
    render(<WasmLoader onFileLoad={vi.fn()} onPathLoad={onPathLoad} loading={false} defaultTab="path" />);
    const input = screen.getByLabelText("WASM file path");
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    expect([...document.querySelectorAll("[role=option]")].map((o) => o.textContent)).toEqual([
      "/ws/.fastedge-debug/app.wasm",
      "/ws/app/target/wasm32-wasip1/release/app.wasm",
    ]);

    fireEvent.click(screen.getByRole("option", { name: "/ws/.fastedge-debug/app.wasm" }));
    fireEvent.click(screen.getByText("Load from Path"));
    expect(onPathLoad).toHaveBeenCalledWith("/ws/.fastedge-debug/app.wasm");
  });
});
