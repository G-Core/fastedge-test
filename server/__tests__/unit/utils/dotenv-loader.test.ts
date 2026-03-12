import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadDotenvFiles, hasDotenvFiles } from "../../../utils/dotenv-loader.js";
import fs from "fs/promises";
import path from "path";

// Mock fs/promises module
vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    access: vi.fn(),
  },
}));

describe("dotenv-loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseDotenv", () => {
    describe("basic key-value parsing", () => {
      it("should parse simple KEY=value pairs", async () => {
        const mockContent = "KEY1=value1\nKEY2=value2";
        vi.mocked(fs.readFile).mockResolvedValue(mockContent);

        const result = await loadDotenvFiles("/test");

        expect(fs.readFile).toHaveBeenCalledWith(
          path.join("/test", ".env"),
          "utf-8"
        );
      });

      it("should parse KEY=value with double quotes", async () => {
        const mockContent = 'API_KEY="my-secret-key"';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");

        // Since .env requires prefixes, let's test with proper prefix
        const mockContentWithPrefix = 'FASTEDGE_VAR_SECRET_API_KEY="my-secret-key"';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContentWithPrefix);

        const result2 = await loadDotenvFiles("/test");
        expect(result2.secrets?.API_KEY).toBe("my-secret-key");
      });

      it("should parse KEY=value with single quotes", async () => {
        const mockContent = "FASTEDGE_VAR_SECRET_TOKEN='bearer-token'";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.TOKEN).toBe("bearer-token");
      });

      it("should handle values without quotes", async () => {
        const mockContent = "FASTEDGE_VAR_ENV_URL=http://example.com";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.dictionary?.URL).toBe("http://example.com");
      });

      it("should trim whitespace around keys and values", async () => {
        const mockContent = "  FASTEDGE_VAR_SECRET_KEY  =  value  ";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.KEY).toBe("value");
      });
    });

    describe("comment and empty line handling", () => {
      it("should skip comment lines starting with #", async () => {
        const mockContent = `# This is a comment
FASTEDGE_VAR_SECRET_KEY=value
# Another comment
FASTEDGE_VAR_ENV_VAR=test`;
        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(mockContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.KEY).toBe("value");
        expect(result.dictionary?.VAR).toBe("test");
        expect(Object.keys(result.secrets || {}).length).toBe(1);
        expect(Object.keys(result.dictionary || {}).length).toBe(1);
      });

      it("should skip empty lines", async () => {
        const mockContent = `FASTEDGE_VAR_SECRET_KEY1=value1

FASTEDGE_VAR_SECRET_KEY2=value2

`;
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.KEY1).toBe("value1");
        expect(result.secrets?.KEY2).toBe("value2");
        expect(Object.keys(result.secrets || {}).length).toBe(2);
      });

      it("should skip lines with only whitespace", async () => {
        const mockContent = `FASTEDGE_VAR_SECRET_KEY1=value1


FASTEDGE_VAR_SECRET_KEY2=value2`;
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.KEY1).toBe("value1");
        expect(result.secrets?.KEY2).toBe("value2");
        expect(Object.keys(result.secrets || {}).length).toBe(2);
      });
    });

    describe("malformed input handling", () => {
      it("should skip lines without equals sign", async () => {
        const mockContent = `FASTEDGE_VAR_SECRET_KEY1=value1
INVALID_LINE_NO_EQUALS
FASTEDGE_VAR_SECRET_KEY2=value2`;
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.KEY1).toBe("value1");
        expect(result.secrets?.KEY2).toBe("value2");
        expect(Object.keys(result.secrets || {}).length).toBe(2);
      });

      it("should handle empty values", async () => {
        const mockContent = "FASTEDGE_VAR_SECRET_EMPTY=";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.EMPTY).toBe("");
      });

      it("should handle values with equals signs", async () => {
        const mockContent = "FASTEDGE_VAR_ENV_CONNECTION=host=localhost;user=admin";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.dictionary?.CONNECTION).toBe("host=localhost;user=admin");
      });

      it("should handle mismatched quotes gracefully", async () => {
        const mockContent = 'FASTEDGE_VAR_SECRET_KEY="value\'';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        // Should not remove quotes if they don't match
        expect(result.secrets?.KEY).toBe('"value\'');
      });

      it("should handle single quote at start only", async () => {
        const mockContent = "FASTEDGE_VAR_SECRET_KEY='value";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.KEY).toBe("'value");
      });

      it("should handle double quote at end only", async () => {
        const mockContent = 'FASTEDGE_VAR_SECRET_KEY=value"';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.KEY).toBe('value"');
      });
    });

    describe("special characters and edge cases", () => {
      it("should handle values with spaces inside quotes", async () => {
        const mockContent = 'FASTEDGE_VAR_SECRET_MESSAGE="hello world with spaces"';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.MESSAGE).toBe("hello world with spaces");
      });

      it("should handle values with special characters", async () => {
        const mockContent = "FASTEDGE_VAR_ENV_SPECIAL=!@#$%^&*()_+-={}[]|:;<>?,./~`";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.dictionary?.SPECIAL).toBe("!@#$%^&*()_+-={}[]|:;<>?,./~`");
      });

      it("should handle values with hash symbol in quotes", async () => {
        const mockContent = 'FASTEDGE_VAR_SECRET_HASH="value#with#hash"';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.HASH).toBe("value#with#hash");
      });

      it("should handle Unicode characters", async () => {
        const mockContent = "FASTEDGE_VAR_ENV_UNICODE=你好世界🌍";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.dictionary?.UNICODE).toBe("你好世界🌍");
      });

      it("should handle escaped characters in quoted strings", async () => {
        const mockContent = 'FASTEDGE_VAR_SECRET_ESCAPED="line1\\nline2\\ttab"';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        // Note: parseDotenv doesn't unescape, it just removes quotes
        expect(result.secrets?.ESCAPED).toBe("line1\\nline2\\ttab");
      });

      it("should handle nested quotes", async () => {
        const mockContent = 'FASTEDGE_VAR_SECRET_NESTED="outer \'inner\' value"';
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");
        expect(result.secrets?.NESTED).toBe("outer 'inner' value");
      });
    });

    describe("empty file handling", () => {
      it("should handle completely empty file", async () => {
        const mockContent = "";
        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(mockContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");
        expect(result.secrets).toEqual({});
        expect(result.dictionary).toEqual({});
      });

      it("should handle file with only comments", async () => {
        const mockContent = `# Comment 1
# Comment 2
# Comment 3`;
        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(mockContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");
        expect(result.secrets).toEqual({});
        expect(result.dictionary).toEqual({});
      });

      it("should handle file with only whitespace and comments", async () => {
        const mockContent = `
# Comment

		# Another comment
   `;
        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(mockContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");
        expect(result.secrets).toEqual({});
        expect(result.dictionary).toEqual({});
      });
    });
  });

  describe("loadDotenvFiles", () => {
    describe("single file loading", () => {
      it("should load .env file with FASTEDGE_VAR_SECRET_ prefix", async () => {
        const mockContent = "FASTEDGE_VAR_SECRET_API_KEY=secret-value";
        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(mockContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");

        expect(result.secrets?.API_KEY).toBe("secret-value");
        expect(result.dictionary).toEqual({});
      });

      it("should load .env file with FASTEDGE_VAR_ENV_ prefix", async () => {
        const mockContent = "FASTEDGE_VAR_ENV_APP_NAME=MyApp";
        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(mockContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");

        expect(result.dictionary?.APP_NAME).toBe("MyApp");
        expect(result.secrets).toEqual({});
      });

      it("should load .env.secrets file without prefix", async () => {
        vi.mocked(fs.readFile)
          .mockRejectedValueOnce(new Error("ENOENT")) // .env not found
          .mockResolvedValueOnce("API_KEY=secret123"); // .env.secrets

        const result = await loadDotenvFiles("/test");

        expect(result.secrets?.API_KEY).toBe("secret123");
      });

      it("should load .env.variables file without prefix", async () => {
        vi.mocked(fs.readFile)
          .mockRejectedValueOnce(new Error("ENOENT")) // .env not found
          .mockRejectedValueOnce(new Error("ENOENT")) // .env.secrets not found
          .mockResolvedValueOnce("APP_NAME=TestApp"); // .env.variables

        const result = await loadDotenvFiles("/test");

        expect(result.dictionary?.APP_NAME).toBe("TestApp");
      });
    });

    describe("multiple file loading", () => {
      it("should load all three files when present", async () => {
        const envContent = `FASTEDGE_VAR_SECRET_KEY1=secret1
FASTEDGE_VAR_ENV_VAR1=value1`;
        const secretsContent = "KEY2=secret2";
        const variablesContent = "VAR2=value2";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockResolvedValueOnce(secretsContent)
          .mockResolvedValueOnce(variablesContent);

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({
          KEY1: "secret1",
          KEY2: "secret2",
        });
        expect(result.dictionary).toEqual({
          VAR1: "value1",
          VAR2: "value2",
        });
      });

      it("should merge secrets from multiple files", async () => {
        const envContent = "FASTEDGE_VAR_SECRET_API_KEY=from-env";
        const secretsContent = "DB_PASSWORD=from-secrets";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockResolvedValueOnce(secretsContent);

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({
          API_KEY: "from-env",
          DB_PASSWORD: "from-secrets",
        });
      });

      it("should merge dictionary values from multiple files", async () => {
        const envContent = "FASTEDGE_VAR_ENV_APP_NAME=from-env";
        const variablesContent = "APP_VERSION=from-variables";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockResolvedValueOnce(variablesContent);

        const result = await loadDotenvFiles("/test");

        expect(result.dictionary).toEqual({
          APP_NAME: "from-env",
          APP_VERSION: "from-variables",
        });
      });

      it("should handle .env.secrets overriding .env secrets", async () => {
        const envContent = "FASTEDGE_VAR_SECRET_API_KEY=env-value";
        const secretsContent = "API_KEY=secrets-value";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockResolvedValueOnce(secretsContent);

        const result = await loadDotenvFiles("/test");

        // .env.secrets should override .env
        expect(result.secrets?.API_KEY).toBe("secrets-value");
      });

      it("should handle .env.variables overriding .env dictionary", async () => {
        const envContent = "FASTEDGE_VAR_ENV_APP_NAME=env-value";
        const variablesContent = "APP_NAME=variables-value";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockResolvedValueOnce(variablesContent);

        const result = await loadDotenvFiles("/test");

        // .env.variables should override .env
        expect(result.dictionary?.APP_NAME).toBe("variables-value");
      });
    });

    describe("error handling", () => {
      it("should handle missing .env file gracefully", async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({});
        expect(result.dictionary).toEqual({});
      });

      it("should handle missing .env.secrets file gracefully", async () => {
        const envContent = "FASTEDGE_VAR_SECRET_KEY=value";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");

        expect(result.secrets?.KEY).toBe("value");
      });

      it("should handle missing .env.variables file gracefully", async () => {
        const envContent = "FASTEDGE_VAR_ENV_VAR=value";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"));

        const result = await loadDotenvFiles("/test");

        expect(result.dictionary?.VAR).toBe("value");
      });

      it("should handle read permission errors gracefully", async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error("EACCES"));

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({});
        expect(result.dictionary).toEqual({});
      });

      it("should handle corrupted file errors gracefully", async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error("Unexpected error"));

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({});
        expect(result.dictionary).toEqual({});
      });
    });

    describe("path handling", () => {
      it("should use current directory when no path provided", async () => {
        const mockContent = "FASTEDGE_VAR_SECRET_KEY=value";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        await loadDotenvFiles();

        expect(fs.readFile).toHaveBeenCalledWith(
          path.join(".", ".env"),
          "utf-8"
        );
      });

      it("should use provided path", async () => {
        const mockContent = "FASTEDGE_VAR_SECRET_KEY=value";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        await loadDotenvFiles("/custom/path");

        expect(fs.readFile).toHaveBeenCalledWith(
          path.join("/custom/path", ".env"),
          "utf-8"
        );
      });

      it("should handle relative paths", async () => {
        const mockContent = "FASTEDGE_VAR_SECRET_KEY=value";
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        await loadDotenvFiles("./config");

        expect(fs.readFile).toHaveBeenCalledWith(
          path.join("./config", ".env"),
          "utf-8"
        );
      });
    });

    describe("prefix filtering", () => {
      it("should ignore non-prefixed variables in .env", async () => {
        const mockContent = `FASTEDGE_VAR_SECRET_KEY=secret
FASTEDGE_VAR_ENV_VAR=value
REGULAR_VAR=ignored
ANOTHER_VAR=also-ignored`;
        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({ KEY: "secret" });
        expect(result.dictionary).toEqual({ VAR: "value" });
      });

      it("should process all variables in .env.secrets regardless of prefix", async () => {
        const secretsContent = `API_KEY=secret1
FASTEDGE_VAR_SECRET_KEY=secret2
REGULAR_KEY=secret3`;

        vi.mocked(fs.readFile)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockResolvedValueOnce(secretsContent);

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({
          API_KEY: "secret1",
          FASTEDGE_VAR_SECRET_KEY: "secret2",
          REGULAR_KEY: "secret3",
        });
      });

      it("should process all variables in .env.variables regardless of prefix", async () => {
        const variablesContent = `APP_NAME=value1
FASTEDGE_VAR_ENV_VAR=value2
REGULAR_VAR=value3`;

        vi.mocked(fs.readFile)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockResolvedValueOnce(variablesContent);

        const result = await loadDotenvFiles("/test");

        expect(result.dictionary).toEqual({
          APP_NAME: "value1",
          FASTEDGE_VAR_ENV_VAR: "value2",
          REGULAR_VAR: "value3",
        });
      });
    });

    describe("complex scenarios", () => {
      it("should handle large files with many variables", async () => {
        const lines = [];
        for (let i = 0; i < 100; i++) {
          lines.push(`FASTEDGE_VAR_SECRET_KEY${i}=value${i}`);
        }
        const mockContent = lines.join("\n");

        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");

        expect(Object.keys(result.secrets || {}).length).toBe(100);
        expect(result.secrets?.KEY0).toBe("value0");
        expect(result.secrets?.KEY99).toBe("value99");
      });

      it("should handle mixed content with comments, empty lines, and variables", async () => {
        const mockContent = `# Configuration file
FASTEDGE_VAR_SECRET_API_KEY=secret123

# Database settings
FASTEDGE_VAR_ENV_DB_HOST=localhost
FASTEDGE_VAR_ENV_DB_PORT=5432

# Cache settings

FASTEDGE_VAR_ENV_CACHE_TTL=3600
# End of file`;

        vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

        const result = await loadDotenvFiles("/test");

        expect(result.secrets).toEqual({
          API_KEY: "secret123",
        });
        expect(result.dictionary).toEqual({
          DB_HOST: "localhost",
          DB_PORT: "5432",
          CACHE_TTL: "3600",
        });
      });

      it("should maintain order independence when loading files", async () => {
        const envContent = "FASTEDGE_VAR_SECRET_A=1";
        const secretsContent = "B=2";
        const variablesContent = "C=3";

        vi.mocked(fs.readFile)
          .mockResolvedValueOnce(envContent)
          .mockResolvedValueOnce(secretsContent)
          .mockResolvedValueOnce(variablesContent);

        const result = await loadDotenvFiles("/test");

        expect(result.secrets?.A).toBe("1");
        expect(result.secrets?.B).toBe("2");
        expect(result.dictionary?.C).toBe("3");
      });
    });
  });

  describe("hasDotenvFiles", () => {
    describe("single file existence", () => {
      it("should return true when .env exists", async () => {
        vi.mocked(fs.access).mockResolvedValueOnce(undefined);

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(true);
        expect(fs.access).toHaveBeenCalledWith(path.join("/test", ".env"));
      });

      it("should return true when .env.secrets exists", async () => {
        vi.mocked(fs.access)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockResolvedValueOnce(undefined);

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(true);
        expect(fs.access).toHaveBeenCalledWith(path.join("/test", ".env"));
        expect(fs.access).toHaveBeenCalledWith(path.join("/test", ".env.secrets"));
      });

      it("should return true when .env.variables exists", async () => {
        vi.mocked(fs.access)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockResolvedValueOnce(undefined);

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(true);
        expect(fs.access).toHaveBeenCalledWith(path.join("/test", ".env.variables"));
      });
    });

    describe("multiple file combinations", () => {
      it("should return true when all files exist", async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(true);
        // Should stop at first file found
        expect(fs.access).toHaveBeenCalledTimes(1);
      });

      it("should return true when only .env and .env.secrets exist", async () => {
        vi.mocked(fs.access).mockResolvedValueOnce(undefined);

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(true);
      });

      it("should return true when only .env.secrets and .env.variables exist", async () => {
        vi.mocked(fs.access)
          .mockRejectedValueOnce(new Error("ENOENT"))
          .mockResolvedValueOnce(undefined);

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(true);
      });
    });

    describe("no files exist", () => {
      it("should return false when no dotenv files exist", async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(false);
        expect(fs.access).toHaveBeenCalledTimes(3);
      });

      it("should return false for empty directory", async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

        const result = await hasDotenvFiles("/empty");

        expect(result).toBe(false);
      });
    });

    describe("path handling", () => {
      it("should use current directory when no path provided", async () => {
        vi.mocked(fs.access).mockResolvedValueOnce(undefined);

        await hasDotenvFiles();

        expect(fs.access).toHaveBeenCalledWith(path.join(".", ".env"));
      });

      it("should use provided path", async () => {
        vi.mocked(fs.access).mockResolvedValueOnce(undefined);

        await hasDotenvFiles("/custom/path");

        expect(fs.access).toHaveBeenCalledWith(
          path.join("/custom/path", ".env")
        );
      });

      it("should handle relative paths", async () => {
        vi.mocked(fs.access).mockResolvedValueOnce(undefined);

        await hasDotenvFiles("./config");

        expect(fs.access).toHaveBeenCalledWith(path.join("./config", ".env"));
      });
    });

    describe("error handling", () => {
      it("should handle permission errors", async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error("EACCES"));

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(false);
      });

      it("should handle invalid path errors", async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error("EINVAL"));

        const result = await hasDotenvFiles("/invalid");

        expect(result).toBe(false);
      });

      it("should check all files even if some throw non-ENOENT errors", async () => {
        vi.mocked(fs.access)
          .mockRejectedValueOnce(new Error("EACCES"))
          .mockRejectedValueOnce(new Error("EACCES"))
          .mockRejectedValueOnce(new Error("EACCES"));

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(false);
        expect(fs.access).toHaveBeenCalledTimes(3);
      });
    });

    describe("performance and optimization", () => {
      it("should stop checking after finding first file", async () => {
        vi.mocked(fs.access).mockResolvedValueOnce(undefined);

        const result = await hasDotenvFiles("/test");

        expect(result).toBe(true);
        expect(fs.access).toHaveBeenCalledTimes(1);
      });

      it("should check files in order: .env, .env.secrets, .env.variables", async () => {
        const calls: string[] = [];
        vi.mocked(fs.access).mockImplementation((filePath) => {
          calls.push(filePath as string);
          return Promise.reject(new Error("ENOENT"));
        });

        await hasDotenvFiles("/test");

        expect(calls).toEqual([
          path.join("/test", ".env"),
          path.join("/test", ".env.secrets"),
          path.join("/test", ".env.variables"),
        ]);
      });
    });
  });

  describe("integration scenarios", () => {
    it("should correctly process a typical development environment", async () => {
      const envContent = `# Development configuration
FASTEDGE_VAR_SECRET_API_KEY="dev-api-key-123"
FASTEDGE_VAR_ENV_APP_NAME="My FastEdge App"
FASTEDGE_VAR_ENV_LOG_LEVEL=debug

# Ignored variable
NODE_ENV=development`;

      const secretsContent = `# Additional secrets
DB_PASSWORD=super-secret-password
JWT_SECRET="jwt-signing-key"`;

      const variablesContent = `# Environment variables
API_ENDPOINT=https://api.example.com
TIMEOUT=30000`;

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(envContent)
        .mockResolvedValueOnce(secretsContent)
        .mockResolvedValueOnce(variablesContent);

      const result = await loadDotenvFiles("/project");

      expect(result.secrets).toEqual({
        API_KEY: "dev-api-key-123",
        DB_PASSWORD: "super-secret-password",
        JWT_SECRET: "jwt-signing-key",
      });

      expect(result.dictionary).toEqual({
        APP_NAME: "My FastEdge App",
        LOG_LEVEL: "debug",
        API_ENDPOINT: "https://api.example.com",
        TIMEOUT: "30000",
      });
    });

    it("should handle a production environment with only essential files", async () => {
      const secretsContent = `API_KEY=prod-key-xyz
DB_PASSWORD=prod-db-pass`;

      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockResolvedValueOnce(secretsContent)
        .mockRejectedValueOnce(new Error("ENOENT"));

      const result = await loadDotenvFiles("/production");

      expect(result.secrets).toEqual({
        API_KEY: "prod-key-xyz",
        DB_PASSWORD: "prod-db-pass",
      });

      expect(result.dictionary).toEqual({});
    });
  });
});
