import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JsonDisplay } from "./JsonDisplay";

describe("JsonDisplay", () => {
  it("starts large content collapsed and expands it on request", () => {
    const { container } = render(<JsonDisplay data={"x".repeat(10_000)} title="Body" />);
    const pre = container.querySelector("pre")!;
    expect(pre.className).toMatch(/collapsed/);
    fireEvent.click(screen.getByText(/Show all \(1 lines, 9\.8 KB\)/));
    expect(pre.className).not.toMatch(/collapsed/);
    fireEvent.click(screen.getByText("Show less"));
    expect(pre.className).toMatch(/collapsed/);
  });

  it("shows small content in full, without a toggle", () => {
    const { container } = render(<JsonDisplay data={{ a: 1 }} compareWith={{ a: 2 }} />);
    expect(container.querySelector("pre")!.className).not.toMatch(/collapsed/);
    expect(screen.queryByText(/Show all/)).toBeNull();
  });
});
