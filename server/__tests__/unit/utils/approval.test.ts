import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAllowedRead } from "../../../utils/allowedFolders";
import { APPROVAL_REPLY, withApproval } from "../../../utils/approval";

const saved = { env: process.env.FASTEDGE_ALLOWED_FOLDERS, send: process.send };
afterEach(() => {
  process.env.FASTEDGE_ALLOWED_FOLDERS = saved.env;
  if (saved.env === undefined) delete process.env.FASTEDGE_ALLOWED_FOLDERS;
  process.send = saved.send;
});

describe("withApproval", () => {
  it("asks once per folder a load needs, however many (a resource may use many folders)", async () => {
    const folders = Array.from({ length: 12 }, (_, i) => mkdtempSync(join(tmpdir(), `many-${i}-`)));
    process.env.FASTEDGE_ALLOWED_FOLDERS = JSON.stringify(folders);
    const asked: string[] = [];
    // The parent (VS Code) approves every request over IPC.
    process.send = ((m: { id: string; folder: string }) => {
      asked.push(m.folder);
      setImmediate(() => process.emit("message", { type: APPROVAL_REPLY, id: m.id, approved: true }, undefined as never));
      return true;
    }) as typeof process.send;

    const read = await withApproval(async () => folders.map((f) => (checkAllowedRead(join(f, "app.wasm")), f)));
    expect(read).toHaveLength(12);
    expect(asked).toHaveLength(12);
  });
});
