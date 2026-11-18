import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { PathInput, suggestions } from "./PathInput";

const LONG = "/home/dev/apps/some/very/deeply/nested/folder/target/wasm32-wasip1/release/convert_resp_headers.wasm";

function Field({ onKey }: { onKey?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <PathInput
      aria-label="path"
      value={value}
      onChange={setValue}
      onKeyDown={onKey}
      suggestions={suggestions(["app/x.wasm", LONG], (p) => (p.startsWith("/") ? p : `../${p}`))}
    />
  );
}

describe("PathInput", () => {
  it("shows whole paths, workspace ones first, allowed folders' under their own heading", () => {
    render(<Field />);
    fireEvent.focus(screen.getByLabelText("path"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["../app/x.wasm", LONG]);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Allowed folders")).toBeInTheDocument();
  });

  it("filters by every typed word, and picks with the keyboard", () => {
    const onKey = vi.fn();
    render(<Field onKey={onKey} />);
    const input = screen.getByLabelText("path");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "release HEADERS" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([LONG]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue(LONG);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onKey).not.toHaveBeenCalled(); // Enter picked; it did not also submit
  });
});
