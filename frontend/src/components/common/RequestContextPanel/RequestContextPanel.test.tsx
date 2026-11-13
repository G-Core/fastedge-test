import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RequestContextPanel } from "./RequestContextPanel";

vi.mock("../../../api", () => ({
  getRequestContextPresets: vi.fn().mockResolvedValue({
    client: {
      de: { city: "Frankfurt am Main", country: "DE" },
      nl: { city: "Amsterdam", country: "NL" },
      us: { city: "Chicago", country: "US" },
    },
    edge: {
      de: { dc: "fr5", city: "Frankfurt am Main" },
      nl: { dc: "am3", city: "Amsterdam" },
      us: { dc: "sv5", city: "San Jose" },
    },
  }),
}));

function renderPanel(client: object | null = { preset: "de" }) {
  const onClientChange = vi.fn();
  const onEdgeChange = vi.fn();
  render(
    <RequestContextPanel
      appType="proxy-wasm"
      client={client}
      edge={null}
      onClientChange={onClientChange}
      onEdgeChange={onEdgeChange}
    />,
  );
  fireEvent.click(screen.getByText("Request Context"));
  return { onClientChange, onEdgeChange };
}

describe("RequestContextPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows preset values and stores an edit as an override", async () => {
    const { onClientChange } = renderPanel();
    const city = await screen.findByDisplayValue("Frankfurt am Main");
    fireEvent.change(city, { target: { value: "Berlin" } });
    expect(onClientChange).toHaveBeenCalledWith({ preset: "de", city: "Berlin" });
  });

  it("drops an override set back to the preset value", async () => {
    const { onClientChange } = renderPanel({ preset: "de", city: "Berlin" });
    fireEvent.change(await screen.findByDisplayValue("Berlin"), { target: { value: "Frankfurt am Main" } });
    expect(onClientChange).toHaveBeenCalledWith({ preset: "de" });
  });

  it("switches presets cleanly and selects none", async () => {
    const { onClientChange, onEdgeChange } = renderPanel({ preset: "de", city: "Berlin" });
    const [clientGroup, edgeGroup] = screen.getAllByRole("radiogroup");
    fireEvent.click(clientGroup.querySelectorAll("button")[2]); // NL
    expect(onClientChange).toHaveBeenLastCalledWith({ preset: "nl" });
    fireEvent.click(clientGroup.querySelectorAll("button")[0]); // None
    expect(onClientChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(edgeGroup.textContent).toContain("San Jose (sv5)"));
    fireEvent.click(edgeGroup.querySelectorAll("button")[3]); // US
    expect(onEdgeChange).toHaveBeenLastCalledWith({ preset: "us" });
  });
});
