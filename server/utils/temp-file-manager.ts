/**
 * Temporary File Manager
 *
 * Handles creation and cleanup of temporary WASM files for HttpWasmRunner
 */

import { writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

/**
 * Write a WASM buffer to a temporary file
 * @param buffer The WASM binary buffer
 * @returns The absolute path to the temporary file
 */
export async function writeTempWasmFile(buffer: Buffer): Promise<string> {
  // Generate unique filename
  const randomId = randomBytes(16).toString("hex");
  const filename = `fastedge-test-${randomId}.wasm`;
  const tempPath = join(tmpdir(), filename);

  // Write buffer to temp file
  await writeFile(tempPath, buffer);

  return tempPath;
}

/**
 * Remove a temporary WASM file
 * @param filePath The absolute path to the temp file
 */
export async function removeTempWasmFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    try {
      await unlink(filePath);
    } catch (error) {
      // Ignore errors (file might already be deleted)
      console.warn(`Failed to remove temp file ${filePath}:`, error);
    }
  }
}

/**
 * Check if a file path is in the temp directory
 * @param filePath The file path to check
 */
export function isTempFile(filePath: string): boolean {
  return filePath.startsWith(tmpdir());
}
