import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAllowedRead } from "../../../utils/allowedFolders";
import { APPROVAL_REPLY, requestApproval, withApproval } from "../../../utils/approval";
import { setTimeout as sleep } from "node:timers/promises";

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

  it("asks one question at a time (two terminal prompts would take the same answer)", async () => {
    const folders = [0, 1].map((i) => mkdtempSync(join(tmpdir(), `one-${i}-`)));
    process.env.FASTEDGE_ALLOWED_FOLDERS = JSON.stringify(folders);
    const asked: { id: string }[] = [];
    process.send = ((m: { id: string }) => (asked.push(m), true)) as typeof process.send;
    const reply = (i: number) => process.emit("message", { type: APPROVAL_REPLY, id: asked[i].id, approved: true }, undefined as never);

    const both = Promise.all(folders.map((f) => requestApproval(f)));
    await sleep(20);
    expect(asked).toHaveLength(1);
    reply(0);
    await sleep(20);
    expect(asked).toHaveLength(2);
    reply(1);
    expect((await both).map((a) => a.approved)).toEqual([true, true]);
  });
});
