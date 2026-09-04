import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigEditorModal } from "./ConfigEditorModal";
import type { TestConfig } from "../../api";

vi.mock("../../api", () => ({
  saveConfigAs: vi.fn(),
  showSaveDialog: vi.fn(),
}));

const minimalConfig: TestConfig = {
  envVars: {},
  secrets: {},
  properties: {},
} as any;

describe("ConfigEditorModal — Strategy 0 (VSCode iframe)", () => {
  let originalTop: typeof window.top;
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Simulate being inside an iframe: window.top !== window
    originalTop = window.top;
    Object.defineProperty(window, "top", { value: null, writable: true, configurable: true });
    postMessageSpy = vi.spyOn(window.parent, "postMessage");
  });

  afterEach(() => {
    Object.defineProperty(window, "top", { value: originalTop, writable: true, configurable: true });
    vi.restoreAllMocks();
  });

  it("posts openSavePicker with type and config, not command", async () => {
    render(<ConfigEditorModal initialConfig={minimalConfig} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    // Give the async handler a tick to run
    await new Promise((r) => setTimeout(r, 0));

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "openSavePicker" }),
      "*"
    );
    // config field must be present and be a JSON string
    const call = postMessageSpy.mock.calls[0][0] as any;
    expect(typeof call.config).toBe("string");
    expect(JSON.parse(call.config)).toEqual(minimalConfig);
  });

  it("never calls saveConfigAs — extension writes the file", async () => {
    const { saveConfigAs } = await import("../../api");
    render(<ConfigEditorModal initialConfig={minimalConfig} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(saveConfigAs).not.toHaveBeenCalled();
  });
});
