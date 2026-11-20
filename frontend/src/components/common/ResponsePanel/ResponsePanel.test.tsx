import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResponsePanel } from "./ResponsePanel";

const response = (body: string, contentType: string, isBase64?: boolean) => ({
  status: 200,
  statusText: "OK",
  headers: { "content-type": contentType },
  body,
  contentType,
  isBase64,
});

describe("ResponsePanel", () => {
  it("collapses a large text body behind Show all", () => {
    const { container } = render(<ResponsePanel response={response("line\n".repeat(500), "text/plain")} />);
    expect(container.querySelector("pre")!.className).toMatch(/collapsed/);
    fireEvent.click(screen.getByText(/Show all \(501 lines/));
    expect(container.querySelector("pre")!.className).not.toMatch(/collapsed/);
  });

  it("still previews a large image, with no collapse", () => {
    const big = "A".repeat(200_000);
    render(<ResponsePanel response={response(big, "image/avif", true)} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe(`data:image/avif;base64,${big}`);
    expect(screen.queryByText(/Show all/)).toBeNull();
  });
});
