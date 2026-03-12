/**
 * Path Validator Tests
 *
 * Unit tests for path validation and security checks
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  validatePath,
  validatePathOrThrow,
  isPathSafe,
} from "../../../utils/pathValidator.js";

describe("Path Validator", () => {
  let tempDir: string;
  let testWasmPath: string;

  beforeAll(async () => {
    // Create temp directory for tests
    tempDir = await mkdtemp(join(tmpdir(), "pathvalidator-test-"));

    // Create a test WASM file
    testWasmPath = join(tempDir, "test.wasm");
    await writeFile(testWasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d])); // WASM magic number
  });

  afterAll(async () => {
    // Cleanup temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("validatePath", () => {
    it("should validate existing WASM file", () => {
      const result = validatePath(testWasmPath);

      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should reject non-existent file", () => {
      const result = validatePath(join(tempDir, "nonexistent.wasm"));

      expect(result.valid).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should reject file without .wasm extension", async () => {
      const txtPath = join(tempDir, "test.txt");
      await writeFile(txtPath, "hello");

      const result = validatePath(txtPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain(".wasm extension");
    });

    it("should reject null/undefined/empty path", () => {
      expect(validatePath("").valid).toBe(false);
      expect(validatePath(null as any).valid).toBe(false);
      expect(validatePath(undefined as any).valid).toBe(false);
    });

    it("should reject non-string path", () => {
      expect(validatePath(123 as any).valid).toBe(false);
      expect(validatePath({} as any).valid).toBe(false);
    });

    it("should normalize paths with ../ and ./", async () => {
      const result = validatePath(join(tempDir, "subdir", "..", "test.wasm"));

      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe(testWasmPath);
    });

    it("should allow file path when requireWasmExtension is false", async () => {
      const txtPath = join(tempDir, "test.txt");
      await writeFile(txtPath, "hello");

      const result = validatePath(txtPath, {
        requireWasmExtension: false,
      });

      expect(result.valid).toBe(true);
    });

    it("should not check existence when checkExists is false", () => {
      const result = validatePath(join(tempDir, "nonexistent.wasm"), {
        checkExists: false,
      });

      // Should be valid because we're not checking existence
      expect(result.valid).toBe(true);
    });

    it("should reject directory path", async () => {
      const result = validatePath(tempDir);

      expect(result.valid).toBe(false);
      // Directory is rejected due to missing .wasm extension (checked first)
      expect(result.error).toContain("File must have .wasm extension");
    });
  });

  describe("workspace root restriction", () => {
    it("should allow path within workspace root", () => {
      const result = validatePath(testWasmPath, {
        workspaceRoot: tempDir,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject path outside workspace root", () => {
      const outsidePath = join(tmpdir(), "outside.wasm");

      const result = validatePath(outsidePath, {
        workspaceRoot: tempDir,
        checkExists: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("within workspace root");
    });

    it("should prevent path traversal attacks", () => {
      const traversalPath = join(tempDir, "..", "..", "etc", "passwd");

      const result = validatePath(traversalPath, {
        workspaceRoot: tempDir,
        checkExists: false,
        requireWasmExtension: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("within workspace root");
    });
  });

  describe("dangerous path blocking", () => {
    it("should block /etc paths", () => {
      const result = validatePath("/etc/passwd", {
        checkExists: false,
        requireWasmExtension: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("system path");
    });

    it("should block /sys paths", () => {
      const result = validatePath("/sys/kernel/debug", {
        checkExists: false,
        requireWasmExtension: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("system path");
    });

    it("should block /proc paths", () => {
      const result = validatePath("/proc/self/environ", {
        checkExists: false,
        requireWasmExtension: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("system path");
    });

    it("should block Windows system paths", () => {
      const result = validatePath("C:\\Windows\\System32\\config\\SAM", {
        checkExists: false,
        requireWasmExtension: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("system path");
    });

    it("should block .ssh directories", () => {
      const result = validatePath(join(tmpdir(), ".ssh", "id_rsa"), {
        checkExists: false,
        requireWasmExtension: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("system path");
    });
  });

  describe("validatePathOrThrow", () => {
    it("should return normalized path for valid input", () => {
      const normalizedPath = validatePathOrThrow(testWasmPath);

      expect(normalizedPath).toBe(testWasmPath);
    });

    it("should throw error for invalid path", () => {
      expect(() => {
        validatePathOrThrow(join(tempDir, "nonexistent.wasm"));
      }).toThrow("File not found");
    });

    it("should throw error for path without .wasm extension", async () => {
      const txtPath = join(tempDir, "test.txt");
      await writeFile(txtPath, "hello");

      expect(() => {
        validatePathOrThrow(txtPath);
      }).toThrow(".wasm extension");
    });
  });

  describe("isPathSafe", () => {
    it("should return true for valid path", () => {
      expect(isPathSafe(testWasmPath)).toBe(true);
    });

    it("should return false for invalid path", () => {
      expect(isPathSafe(join(tempDir, "nonexistent.wasm"))).toBe(false);
    });

    it("should return false for dangerous path", () => {
      expect(
        isPathSafe("/etc/passwd", {
          checkExists: false,
          requireWasmExtension: false,
        }),
      ).toBe(false);
    });
  });

  describe("absolute path handling", () => {
    it("should allow absolute paths by default", () => {
      const result = validatePath(testWasmPath);

      expect(result.valid).toBe(true);
    });

    it("should reject absolute paths when allowAbsolute is false", () => {
      const result = validatePath(testWasmPath, {
        allowAbsolute: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Absolute paths are not allowed");
    });

    it("should allow relative paths", async () => {
      // Change to temp directory and use relative path
      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const result = validatePath("./test.wasm");
        expect(result.valid).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
