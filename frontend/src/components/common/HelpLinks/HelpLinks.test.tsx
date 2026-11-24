import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpLinks } from "./HelpLinks";

describe("HelpLinks", () => {
  it("links to the docs of the running version, opened outside the page", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<HelpLinks />);
    const links = screen.getAllByRole("link", { hidden: true });
    const docs = links.filter((a) => !a.getAttribute("href")!.startsWith("https://marketplace.visualstudio.com/"));
    expect(docs.length).toBe(links.length - 1);
    for (const link of docs) {
      expect(link.getAttribute("href")!.startsWith("https://github.com/G-Core/fastedge-test/blob/v1.2.3/docs/")).toBe(true);
    }
    expect(screen.getByText("v1.2.3")).toBeTruthy();

    const secrets = screen.getByRole("link", { name: "Set environment variables and secrets", hidden: true });
    fireEvent.click(secrets);
    expect(open).toHaveBeenCalledWith(secrets.getAttribute("href"), "_blank", "noopener");
  });
});
