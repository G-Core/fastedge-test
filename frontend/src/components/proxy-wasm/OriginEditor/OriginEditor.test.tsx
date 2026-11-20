import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { OriginEditor } from "./OriginEditor";
import type { ResourceOrigin, WorkspaceFiles } from "../../../api";

const files: WorkspaceFiles = {
  root: "/ws",
  wasm: [],
  configs: [],
  dotenvDirs: [],
  folders: ["assets"],
  files: ["assets/photo.png"],
  truncated: false,
};

/** The editor with its value held, as a page holds it; `seen` gets every change. */
function Harness({ initial, seen, unsetLabel }: { initial?: ResourceOrigin; seen: (o: ResourceOrigin | undefined) => void; unsetLabel?: string }) {
  const [value, setValue] = useState<ResourceOrigin | undefined>(initial);
  return (
    <OriginEditor
      label="main origin"
      value={value}
      onChange={(o) => {
        setValue(o);
        seen(o);
      }}
      unsetLabel={unsetLabel}
      apps={["api"]}
      files={files}
      toPath={(p) => `../${p}`}
      onFocusPath={() => {}}
    />
  );
}

describe("OriginEditor", () => {
  it("writes each kind of origin as config files and agents write it", () => {
    const seen = vi.fn();
    render(<Harness initial={{ url: "built-in" }} seen={seen} unsetLabel="main's" />);
    const kind = screen.getByLabelText("main origin");

    fireEvent.change(kind, { target: { value: "fixed" } });
    fireEvent.change(screen.getByLabelText("main origin status"), { target: { value: "404" } });
    fireEvent.change(screen.getByLabelText("main origin body"), { target: { value: "gone" } });
    fireEvent.change(screen.getByLabelText("main origin headers"), { target: { value: "content-type: text/plain\nx-half" } });
    expect(seen).toHaveBeenLastCalledWith({ builtIn: { status: 404, body: "gone", headers: { "content-type": "text/plain", "x-half": "" } } });
    // A half-typed header line stays as typed.
    expect((screen.getByLabelText("main origin headers") as HTMLTextAreaElement).value).toBe("content-type: text/plain\nx-half");

    fireEvent.change(screen.getByLabelText("main origin body source"), { target: { value: "file" } });
    fireEvent.change(screen.getByLabelText("main origin body file"), { target: { value: "../assets/photo.png" } });
    expect(seen.mock.lastCall![0]).toEqual({ builtIn: { status: 404, bodyFile: "../assets/photo.png", headers: { "content-type": "text/plain", "x-half": "" } } });

    fireEvent.change(kind, { target: { value: "files" } });
    const folder = screen.getByLabelText("main origin folder");
    fireEvent.focus(folder);
    expect([...document.querySelectorAll("[role=option]")].map((o) => o.textContent)).toEqual(["../assets"]);
    fireEvent.click(screen.getByRole("option", { name: "../assets" }));
    expect(seen).toHaveBeenLastCalledWith({ builtIn: { files: "../assets" } });

    fireEvent.change(kind, { target: { value: "url" } });
    fireEvent.change(screen.getByLabelText("main origin URL"), { target: { value: "https://origin.example" } });
    expect(seen).toHaveBeenLastCalledWith({ url: "https://origin.example" });

    fireEvent.change(kind, { target: { value: "app:api" } });
    expect(seen).toHaveBeenLastCalledWith({ app: "api" });

    fireEvent.change(kind, { target: { value: "unset" } });
    expect(seen).toHaveBeenLastCalledWith(undefined);
  });

  it("shows a loaded origin's fields", () => {
    render(<Harness initial={{ builtIn: { status: 201, headers: { "x-a": "1" }, body: "ok" } }} seen={vi.fn()} />);
    expect((screen.getByLabelText("main origin") as HTMLSelectElement).value).toBe("fixed");
    expect((screen.getByLabelText("main origin status") as HTMLInputElement).value).toBe("201");
    expect((screen.getByLabelText("main origin headers") as HTMLTextAreaElement).value).toBe("x-a: 1");
    expect(screen.queryByRole("option", { name: "main's" })).toBeNull(); // main must have an origin
  });
});
