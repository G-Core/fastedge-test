import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpLinks } from "./HelpLinks";

describe("HelpLinks", () => {
  it("links to the docs of the running version, opened outside the page", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<HelpLinks />);
    const links = screen.getAllByRole("link", { hidden: true });
    for (const link of links.filter((a) => a.getAttribute("href")!.includes("github.com"))) {
      expect(link.getAttribute("href")).toContain("/fastedge-test/blob/v1.2.3/docs/");
    }
    expect(screen.getByText("v1.2.3")).toBeTruthy();

    const secrets = screen.getByRole("link", { name: "Set environment variables and secrets", hidden: true });
    fireEvent.click(secrets);
    expect(open).toHaveBeenCalledWith(secrets.getAttribute("href"), "_blank", "noopener");
  });
});
