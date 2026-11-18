import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { ApprovalNeeded, recordApproval } from "./allowedFolders.js";
import { validatePath, type PathValidationOptions, type PathValidationResult } from "./pathValidator.js";

/**
 * Asking the user to approve an allowed folder, through a channel the HTTP API can't reach:
 * - under FastEdge for VS Code (forked with an IPC channel): a request to the extension, which
 *   asks the user and answers over the same channel;
 * - started from a terminal: a y/N prompt there;
 * - otherwise: refused.
 * An answer lasts for the server's lifetime; no answer (timeout) is not remembered.
 */

const TIMEOUT_MS = 120_000;
const pending = new Map<string, Promise<boolean>>();

export const APPROVAL_REQUEST = "fastedge:approve-folder";
export const APPROVAL_REPLY = "fastedge:folder-approval";

export function requestApproval(folder: string): Promise<boolean> {
  let request = pending.get(folder);
  if (!request) {
    request = ask(folder).finally(() => pending.delete(folder));
    pending.set(folder, request);
  }
  return request;
}

async function ask(folder: string): Promise<boolean> {
  const answer = process.send ? await askParent(folder) : process.stdin.isTTY ? await askTerminal(folder) : false;
  if (answer !== null) recordApproval(folder, answer);
  return answer === true;
}

function askParent(folder: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    const id = randomUUID();
    const onMessage = (message: unknown) => {
      const m = message as { type?: string; id?: string; approved?: unknown };
      if (m?.type !== APPROVAL_REPLY || m.id !== id) return;
      done(m.approved === true);
    };
    const timer = setTimeout(() => done(null), TIMEOUT_MS);
    const done = (answer: boolean | null) => {
      clearTimeout(timer);
      process.off("message", onMessage);
      resolve(answer);
    };
    process.on("message", onMessage);
    process.send!({ type: APPROVAL_REQUEST, id, folder });
  });
}

async function askTerminal(folder: string): Promise<boolean | null> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const reply = await Promise.race([
      rl.question(
        `\nThe debugger wants to read ${folder}, an allowed folder outside the workspace.\n` +
          "Every config loaded in this session could read it, and a loaded app can send what it reads over the network.\n" +
          "Allow it for this session? [y/N] ",
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS).unref()),
    ]);
    return reply === null ? null : /^y(es)?$/i.test(reply.trim());
  } finally {
    rl.close();
  }
}

/** The user did not approve reading an allowed folder (a 400 for the caller). */
export class NotApproved extends Error {
  constructor(folder: string) {
    super(`Reading ${folder} was not approved.`);
  }
}

/** Runs `work`; when it needs an allowed folder approved, asks the user, then runs it again. */
export async function withApproval<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof ApprovalNeeded) || attempt >= 8) throw error;
      if (!(await requestApproval(error.folder))) throw new NotApproved(error.folder);
    }
  }
}

/** `validatePath` for a read that may come from an approved allowed folder, asking the user first. */
export async function validateRead(input: string, options: PathValidationOptions): Promise<PathValidationResult> {
  for (let attempt = 0; ; attempt++) {
    const result = validatePath(input, { ...options, allowedFolders: true });
    if (!result.approvalNeeded || attempt >= 8) return result;
    if (!(await requestApproval(result.approvalNeeded))) return { valid: false, error: new NotApproved(result.approvalNeeded).message };
  }
}
