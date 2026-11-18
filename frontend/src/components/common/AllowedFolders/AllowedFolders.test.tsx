import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AllowedFolders } from "./AllowedFolders";

const ask = vi.fn();
vi.mock("../../../api", () => ({ askAllowedFolder: (folder: string) => ask(folder) }));

describe("AllowedFolders", () => {
  it("shows nothing without allowed folders", () => {
    const { container } = render(<AllowedFolders folders={[]} onState={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("Ask waits for the user's answer, then reports the folder's new state", async () => {
    let answer!: (r: unknown) => void;
    ask.mockReturnValue(new Promise((r) => (answer = r)));
    const onState = vi.fn();
    render(
      <AllowedFolders
        folders={[{ folder: "/lib", state: "not asked" }, { folder: "/old", state: "refused" }]}
        onState={onState}
      />,
    );
    expect(screen.getByText(/refused this session/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask to read it" }));
    expect(ask).toHaveBeenCalledWith("/lib");
    expect(screen.getByText(/waiting for your answer/)).toBeInTheDocument();
    answer({ state: "refused", error: "Reading /lib was not approved (asked in the terminal that started the debugger)." });
    await waitFor(() => expect(onState).toHaveBeenCalledWith("/lib", "refused"));
    expect(screen.getByText(/asked in the terminal/)).toBeInTheDocument();
  });
});
