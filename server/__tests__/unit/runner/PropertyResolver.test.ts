import { describe, it, expect, beforeEach } from "vitest";
import { PropertyResolver } from "../../../runner/PropertyResolver";
import type { HeaderMap } from "../../../runner/types";

describe("PropertyResolver", () => {
  let resolver: PropertyResolver;

  beforeEach(() => {
    resolver = new PropertyResolver();
  });

  describe("Property path resolution", () => {
    it("should resolve request.method from metadata", () => {
      resolver.setRequestMetadata({}, "POST");
      expect(resolver.resolve("request.method")).toBe("POST");
    });

    it("should resolve request.path from metadata", () => {
      resolver.setRequestMetadata({}, "GET", "/api/users");
      expect(resolver.resolve("request.path")).toBe("/api/users");
    });

    it("should default request.path to / when not set", () => {
      resolver.setRequestMetadata({}, "GET");
      expect(resolver.resolve("request.path")).toBe("/");
    });

    it("should not override request.path when set to /", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/custom/path");
      resolver.setRequestMetadata({}, "GET", "/");
      expect(resolver.resolve("request.path")).toBe("/custom/path");
    });

    it("should resolve request.scheme from metadata", () => {
      resolver.setRequestMetadata({}, "GET", "/", "http");
      expect(resolver.resolve("request.scheme")).toBe("http");
    });

    it("should resolve request.url when constructed from components", () => {
      resolver.setRequestMetadata({}, "GET", "/api/users", "https");
      resolver.extractRuntimePropertiesFromUrl("https://example.com/api/users");
      expect(resolver.resolve("request.url")).toBe("https://example.com/api/users");
    });

    it("should resolve request.host from URL extraction", () => {
      resolver.extractRuntimePropertiesFromUrl("https://api.example.com/test");
      expect(resolver.resolve("request.host")).toBe("api.example.com");
    });

    it("should resolve request.host from headers when URL not parsed", () => {
      resolver.setRequestMetadata({ host: "header-host.com" }, "GET");
      expect(resolver.resolve("request.host")).toBe("header-host.com");
    });

    it("should default request.host to localhost when not available", () => {
      resolver.setRequestMetadata({}, "GET");
      expect(resolver.resolve("request.host")).toBe("localhost");
    });

    it("should resolve request.query from URL", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path?foo=bar&baz=qux");
      expect(resolver.resolve("request.query")).toBe("foo=bar&baz=qux");
    });

    it("should resolve empty request.query when no query string", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path");
      expect(resolver.resolve("request.query")).toBe("");
    });

    it("should resolve request.extension from URL path", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/file.json");
      expect(resolver.resolve("request.extension")).toBe("json");
    });

    it("should resolve request.protocol as alias for request.scheme", () => {
      resolver.setRequestMetadata({}, "GET", "/", "https");
      expect(resolver.resolve("request.protocol")).toBe("https");
    });

    it("should resolve request.content_type from headers", () => {
      resolver.setRequestMetadata({ "content-type": "application/json" }, "POST");
      expect(resolver.resolve("request.content_type")).toBe("application/json");
    });

    it("should resolve individual request headers", () => {
      resolver.setRequestMetadata(
        { "content-type": "application/json", "x-custom-header": "value" },
        "GET"
      );
      expect(resolver.resolve("request.headers.content-type")).toBe("application/json");
      expect(resolver.resolve("request.headers.x-custom-header")).toBe("value");
    });

    it("should normalize header names to lowercase when resolving", () => {
      resolver.setRequestMetadata({ "content-type": "text/html" }, "GET");
      expect(resolver.resolve("request.headers.content-type")).toBe("text/html");
    });

    it("should return empty string for missing request headers", () => {
      resolver.setRequestMetadata({}, "GET");
      expect(resolver.resolve("request.headers.missing")).toBe("");
    });
  });

  describe("Response property resolution", () => {
    it("should resolve response.code", () => {
      resolver.setResponseMetadata({}, 404, "Not Found");
      expect(resolver.resolve("response.code")).toBe(404);
    });

    it("should resolve response.status as alias for response.code", () => {
      resolver.setResponseMetadata({}, 500, "Internal Server Error");
      expect(resolver.resolve("response.status")).toBe(500);
    });

    it("should resolve response.status_code as alias for response.code", () => {
      resolver.setResponseMetadata({}, 201, "Created");
      expect(resolver.resolve("response.status_code")).toBe(201);
    });

    it("should resolve response.code_details", () => {
      resolver.setResponseMetadata({}, 403, "Forbidden");
      expect(resolver.resolve("response.code_details")).toBe("Forbidden");
    });

    it("should resolve response.content_type from headers", () => {
      resolver.setResponseMetadata({ "content-type": "application/xml" }, 200, "OK");
      expect(resolver.resolve("response.content_type")).toBe("application/xml");
    });

    it("should resolve individual response headers", () => {
      resolver.setResponseMetadata(
        { "content-type": "text/plain", "cache-control": "no-cache" },
        200,
        "OK"
      );
      expect(resolver.resolve("response.headers.content-type")).toBe("text/plain");
      expect(resolver.resolve("response.headers.cache-control")).toBe("no-cache");
    });

    it("should return empty string for missing response headers", () => {
      resolver.setResponseMetadata({}, 200, "OK");
      expect(resolver.resolve("response.headers.missing")).toBe("");
    });

    it("should default response status to 200", () => {
      expect(resolver.resolve("response.status")).toBe(200);
    });

    it("should default response status text to OK", () => {
      expect(resolver.resolve("response.code_details")).toBe("OK");
    });
  });

  describe("URL parsing and extraction", () => {
    it("should extract all URL components from https URL", () => {
      resolver.extractRuntimePropertiesFromUrl("https://api.example.com:8080/v1/users?id=123");
      expect(resolver.resolve("request.url")).toBe("https://api.example.com:8080/v1/users?id=123");
      expect(resolver.resolve("request.host")).toBe("api.example.com:8080");
      expect(resolver.resolve("request.path")).toBe("/v1/users");
      expect(resolver.resolve("request.query")).toBe("id=123");
      expect(resolver.resolve("request.scheme")).toBe("https");
      expect(resolver.resolve("request.extension")).toBe("");
    });

    it("should extract all URL components from http URL", () => {
      resolver.extractRuntimePropertiesFromUrl("http://localhost:3000/api/data.json?format=compact");
      expect(resolver.resolve("request.url")).toBe("http://localhost:3000/api/data.json?format=compact");
      expect(resolver.resolve("request.host")).toBe("localhost:3000");
      expect(resolver.resolve("request.path")).toBe("/api/data.json");
      expect(resolver.resolve("request.query")).toBe("format=compact");
      expect(resolver.resolve("request.scheme")).toBe("http");
      expect(resolver.resolve("request.extension")).toBe("json");
    });

    it("should handle URL without port", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path");
      expect(resolver.resolve("request.host")).toBe("example.com");
    });

    it("should handle URL with port", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com:9000/path");
      expect(resolver.resolve("request.host")).toBe("example.com:9000");
    });

    it("should handle URL without path", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com");
      expect(resolver.resolve("request.path")).toBe("/");
    });

    it("should handle URL with query string starting with ?", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path?key=value");
      expect(resolver.resolve("request.query")).toBe("key=value");
    });

    it("should extract file extension from path with multiple dots", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/file.backup.tar.gz");
      expect(resolver.resolve("request.extension")).toBe("gz");
    });

    it("should extract file extension from simple filename", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/image.png");
      expect(resolver.resolve("request.extension")).toBe("png");
    });

    it("should handle path without extension", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/api/users");
      expect(resolver.resolve("request.extension")).toBe("");
    });

    it("should handle path with trailing slash", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path/");
      expect(resolver.resolve("request.extension")).toBe("");
    });

    it("should handle hidden files (dot at start)", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/.gitignore");
      expect(resolver.resolve("request.extension")).toBe("");
    });

    it("should handle files with dot but no extension", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/file.");
      expect(resolver.resolve("request.extension")).toBe("");
    });

    it("should handle complex query strings", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/search?q=hello+world&limit=10&offset=20");
      expect(resolver.resolve("request.query")).toBe("q=hello+world&limit=10&offset=20");
    });

    it("should handle URL with fragment (hash)", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/page#section");
      expect(resolver.resolve("request.path")).toBe("/page");
      expect(resolver.resolve("request.query")).toBe("");
    });

    it("should handle URL with encoded characters", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path%20with%20spaces/file%2Bname.txt");
      expect(resolver.resolve("request.path")).toBe("/path%20with%20spaces/file%2Bname.txt");
      expect(resolver.resolve("request.extension")).toBe("txt");
    });
  });

  describe("URL parsing error handling", () => {
    it("should handle malformed URL with fallback values", () => {
      resolver.extractRuntimePropertiesFromUrl("not-a-valid-url");
      expect(resolver.resolve("request.url")).toBe("not-a-valid-url");
      expect(resolver.resolve("request.host")).toBe("localhost");
      expect(resolver.resolve("request.path")).toBe("/");
      expect(resolver.resolve("request.query")).toBe("");
      expect(resolver.resolve("request.extension")).toBe("");
    });

    it("should handle empty URL string", () => {
      resolver.extractRuntimePropertiesFromUrl("");
      // Empty URL falls back to constructed URL with localhost
      // Since requestUrl is empty, it constructs from components
      expect(resolver.resolve("request.url")).toBe("https://localhost/");
      expect(resolver.resolve("request.host")).toBe("localhost");
      expect(resolver.resolve("request.path")).toBe("/");
    });

    it("should handle URL with only protocol", () => {
      resolver.extractRuntimePropertiesFromUrl("https://");
      expect(resolver.resolve("request.url")).toBe("https://");
      expect(resolver.resolve("request.host")).toBe("localhost");
    });
  });

  describe("Property merging", () => {
    it("should merge user properties with calculated properties", () => {
      resolver.setProperties({ "custom.key": "custom-value" });
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path");

      const allProps = resolver.getAllProperties();
      expect(allProps["custom.key"]).toBe("custom-value");
      expect(allProps["request.url"]).toBe("https://example.com/path");
      expect(allProps["request.host"]).toBe("example.com");
    });

    it("should allow user properties to override calculated properties", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path");
      resolver.setProperties({ "request.host": "override-host.com" });

      const allProps = resolver.getAllProperties();
      expect(allProps["request.host"]).toBe("override-host.com");
    });

    it("should return only calculated properties when no user properties set", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/api");

      const allProps = resolver.getAllProperties();
      expect(allProps["request.url"]).toBe("https://example.com/api");
      expect(allProps["request.path"]).toBe("/api");
      expect(allProps["request.host"]).toBe("example.com");
      expect(allProps["request.query"]).toBe("");
      expect(allProps["request.scheme"]).toBe("https");
      expect(allProps["request.method"]).toBe("GET");
      expect(allProps["request.extension"]).toBe("");
    });

    it("should get calculated properties separately", () => {
      resolver.extractRuntimePropertiesFromUrl("https://api.example.com/users?limit=10");
      resolver.setRequestMetadata({}, "POST");

      const calculated = resolver.getCalculatedProperties();
      expect(calculated["request.url"]).toBe("https://api.example.com/users?limit=10");
      expect(calculated["request.host"]).toBe("api.example.com");
      expect(calculated["request.path"]).toBe("/users");
      expect(calculated["request.query"]).toBe("limit=10");
      expect(calculated["request.scheme"]).toBe("https");
      expect(calculated["request.method"]).toBe("POST");
      expect(calculated["request.extension"]).toBe("");
    });
  });

  describe("Property setting and retrieval", () => {
    it("should set and retrieve a single property", () => {
      resolver.setProperty("my.custom.property", "test-value");
      expect(resolver.resolve("my.custom.property")).toBe("test-value");
    });

    it("should set multiple properties", () => {
      resolver.setProperties({
        "key1": "value1",
        "key2": "value2",
        "nested.key": "nested-value"
      });
      expect(resolver.resolve("key1")).toBe("value1");
      expect(resolver.resolve("key2")).toBe("value2");
      expect(resolver.resolve("nested.key")).toBe("nested-value");
    });

    it("should normalize null characters to dots when setting property", () => {
      resolver.setProperty("path\0with\0nulls", "test-value");
      expect(resolver.resolve("path.with.nulls")).toBe("test-value");
    });

    it("should allow overwriting existing properties", () => {
      resolver.setProperty("key", "initial-value");
      resolver.setProperty("key", "updated-value");
      expect(resolver.resolve("key")).toBe("updated-value");
    });

    it("should replace all properties when calling setProperties", () => {
      resolver.setProperty("old-key", "old-value");
      resolver.setProperties({ "new-key": "new-value" });
      expect(resolver.resolve("old-key")).toBeUndefined();
      expect(resolver.resolve("new-key")).toBe("new-value");
    });
  });

  describe("Property path normalization and resolution", () => {
    it("should normalize null characters to dots when resolving", () => {
      resolver.setProperties({ "path.with.dots": "value" });
      expect(resolver.resolve("path\0with\0dots")).toBe("value");
    });

    it("should resolve nested object properties", () => {
      resolver.setProperties({
        nested: {
          level1: {
            level2: "deep-value"
          }
        }
      });
      expect(resolver.resolve("nested\0level1\0level2")).toBe("deep-value");
    });

    it("should resolve dot-separated nested paths", () => {
      resolver.setProperties({
        nested: {
          level1: {
            level2: "deep-value"
          }
        }
      });
      expect(resolver.resolve("nested.level1.level2")).toBe("deep-value");
    });

    it("should prefer direct property match over nested resolution", () => {
      resolver.setProperties({
        "flat.key": "flat-value",
        flat: { key: "nested-value" }
      });
      expect(resolver.resolve("flat.key")).toBe("flat-value");
    });

    it("should handle slash-separated paths", () => {
      resolver.setProperties({ "path/with/slashes": "value" });
      expect(resolver.resolve("path\0with\0slashes")).toBe("value");
    });

    it("should return undefined for non-existent properties", () => {
      expect(resolver.resolve("nonexistent.property")).toBeUndefined();
    });

    it("should return undefined for invalid nested path", () => {
      resolver.setProperties({ nested: { level1: "value" } });
      expect(resolver.resolve("nested.nonexistent.path")).toBeUndefined();
    });

    it("should skip empty segments in path resolution", () => {
      resolver.setProperties({
        nested: { key: "value" }
      });
      expect(resolver.resolve("nested\0\0key")).toBe("value");
    });
  });

  describe("Property chaining between hooks", () => {
    it("should preserve properties set in one hook for the next", () => {
      // Simulate first hook
      resolver.setProperty("hook1.result", "first-value");
      const props1 = resolver.getAllProperties();

      // Simulate second hook receiving properties from first
      const resolver2 = new PropertyResolver();
      resolver2.setProperties(props1);
      expect(resolver2.resolve("hook1.result")).toBe("first-value");
    });

    it("should chain URL-extracted properties between hooks", () => {
      resolver.extractRuntimePropertiesFromUrl("https://api.example.com/v1/users");
      resolver.setRequestMetadata({}, "GET");
      const props = resolver.getAllProperties();

      const resolver2 = new PropertyResolver();
      resolver2.setProperties(props);
      expect(resolver2.resolve("request.host")).toBe("api.example.com");
      expect(resolver2.resolve("request.path")).toBe("/v1/users");
    });

    it("should allow second hook to override properties from first", () => {
      resolver.setProperty("shared.key", "first-value");
      const props1 = resolver.getAllProperties();

      const resolver2 = new PropertyResolver();
      resolver2.setProperties(props1);
      resolver2.setProperty("shared.key", "second-value");
      expect(resolver2.resolve("shared.key")).toBe("second-value");
    });

    it("should accumulate properties across multiple hooks", () => {
      // Hook 1
      resolver.setProperty("hook1.data", "value1");
      const props1 = resolver.getAllProperties();

      // Hook 2
      const resolver2 = new PropertyResolver();
      resolver2.setProperties(props1);
      resolver2.setProperty("hook2.data", "value2");
      const props2 = resolver2.getAllProperties();

      // Hook 3
      const resolver3 = new PropertyResolver();
      resolver3.setProperties(props2);
      expect(resolver3.resolve("hook1.data")).toBe("value1");
      expect(resolver3.resolve("hook2.data")).toBe("value2");
    });
  });

  describe("Root ID derivation", () => {
    it("should derive root_id from root_id property", () => {
      resolver.setProperties({ root_id: "my-root-id" });
      expect(resolver.resolve("root_id")).toBe("my-root-id");
      expect(resolver.resolve("plugin_name")).toBe("my-root-id");
      expect(resolver.resolve("plugin_root_id")).toBe("my-root-id");
    });

    it("should derive root_id from rootId property", () => {
      resolver.setProperties({ rootId: "camel-case-id" });
      expect(resolver.resolve("root_id")).toBe("camel-case-id");
    });

    it("should derive root_id from plugin_name property", () => {
      resolver.setProperties({ plugin_name: "my-plugin" });
      expect(resolver.resolve("root_id")).toBe("my-plugin");
    });

    it("should derive root_id from root_context property", () => {
      resolver.setProperties({ root_context: "my-context" });
      expect(resolver.resolve("root_id")).toBe("my-context");
    });

    it("should prioritize earlier candidates in derivation", () => {
      resolver.setProperties({
        root_id: "first-choice",
        rootId: "second-choice",
        plugin_name: "third-choice"
      });
      // When resolving "plugin_name", it first checks if it exists as a direct property
      // Since "plugin_name" is set directly, it returns that value
      expect(resolver.resolve("plugin_name")).toBe("third-choice");
      // But root_id derives from the first candidate found
      expect(resolver.resolve("root_id")).toBe("first-choice");
    });

    it("should not derive root_id when no candidates exist", () => {
      resolver.setProperties({ other_prop: "value" });
      expect(resolver.resolve("plugin_name")).toBeUndefined();
    });

    it("should ignore empty string candidates in derivation", () => {
      resolver.setProperties({
        root_id: "",
        plugin_name: "valid-name"
      });
      // Direct property access returns empty string
      expect(resolver.resolve("root_id")).toBe("");
      // But root_context derives from first non-empty candidate (plugin_name)
      expect(resolver.resolve("root_context")).toBe("valid-name");
    });

    it("should resolve root_context_id from derived root_id", () => {
      resolver.setProperties({ root_id: "my-root" });
      expect(resolver.resolve("root_context_id")).toBe("my-root");
    });

    it("should resolve root_context from derived root_id", () => {
      resolver.setProperties({ plugin_name: "my-plugin" });
      expect(resolver.resolve("root_context")).toBe("my-plugin");
    });
  });

  describe("Edge cases and special characters", () => {
    it("should handle properties with special characters", () => {
      resolver.setProperties({
        "key-with-dashes": "value1",
        "key_with_underscores": "value2",
        "key.with.dots": "value3"
      });
      expect(resolver.resolve("key-with-dashes")).toBe("value1");
      expect(resolver.resolve("key_with_underscores")).toBe("value2");
      expect(resolver.resolve("key.with.dots")).toBe("value3");
    });

    it("should handle properties with numeric values", () => {
      resolver.setProperty("port", 8080);
      expect(resolver.resolve("port")).toBe(8080);
    });

    it("should handle properties with boolean values", () => {
      resolver.setProperty("enabled", true);
      resolver.setProperty("disabled", false);
      expect(resolver.resolve("enabled")).toBe(true);
      expect(resolver.resolve("disabled")).toBe(false);
    });

    it("should handle properties with null values", () => {
      resolver.setProperty("nullable", null);
      expect(resolver.resolve("nullable")).toBe(null);
    });

    it("should handle properties with array values", () => {
      resolver.setProperty("items", ["a", "b", "c"]);
      expect(resolver.resolve("items")).toEqual(["a", "b", "c"]);
    });

    it("should handle properties with object values", () => {
      const obj = { nested: { key: "value" } };
      resolver.setProperty("complex", obj);
      expect(resolver.resolve("complex")).toEqual(obj);
    });

    it("should handle empty property keys", () => {
      resolver.setProperties({ "": "empty-key-value" });
      expect(resolver.resolve("")).toBe("empty-key-value");
    });

    it("should handle URL with international characters", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/путь/файл.json");
      // URL encoding is preserved in the path
      expect(resolver.resolve("request.path")).toBe("/%D0%BF%D1%83%D1%82%D1%8C/%D1%84%D0%B0%D0%B9%D0%BB.json");
      expect(resolver.resolve("request.extension")).toBe("json");
    });

    it("should handle missing URL components gracefully", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com");
      expect(resolver.resolve("request.path")).toBe("/");
      expect(resolver.resolve("request.query")).toBe("");
      expect(resolver.resolve("request.extension")).toBe("");
    });

    it("should handle very long property paths", () => {
      const longPath = "a".repeat(100);
      resolver.setProperty(longPath, "long-value");
      expect(resolver.resolve(longPath)).toBe("long-value");
    });

    it("should handle deeply nested property structures", () => {
      const deep = {
        l1: { l2: { l3: { l4: { l5: { l6: "deep-value" } } } } }
      };
      resolver.setProperties({ deep });
      expect(resolver.resolve("deep.l1.l2.l3.l4.l5.l6")).toBe("deep-value");
    });
  });

  describe("Runtime property calculation", () => {
    it("should calculate properties from URL at runtime", () => {
      resolver.extractRuntimePropertiesFromUrl("https://api.example.com:8080/v2/users.json?limit=50");

      const calculated = resolver.getCalculatedProperties();
      expect(calculated["request.url"]).toBe("https://api.example.com:8080/v2/users.json?limit=50");
      expect(calculated["request.host"]).toBe("api.example.com:8080");
      expect(calculated["request.path"]).toBe("/v2/users.json");
      expect(calculated["request.query"]).toBe("limit=50");
      expect(calculated["request.scheme"]).toBe("https");
      expect(calculated["request.extension"]).toBe("json");
    });

    it("should recalculate properties when URL changes", () => {
      resolver.extractRuntimePropertiesFromUrl("https://first.com/path1");
      expect(resolver.resolve("request.host")).toBe("first.com");

      resolver.extractRuntimePropertiesFromUrl("https://second.com/path2");
      expect(resolver.resolve("request.host")).toBe("second.com");
    });

    it("should update method at runtime", () => {
      resolver.setRequestMetadata({}, "GET");
      expect(resolver.resolve("request.method")).toBe("GET");

      resolver.setRequestMetadata({}, "POST");
      expect(resolver.resolve("request.method")).toBe("POST");
    });

    it("should preserve URL-extracted path when metadata path is /", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/extracted/path");
      expect(resolver.resolve("request.path")).toBe("/extracted/path");

      resolver.setRequestMetadata({}, "GET", "/");
      expect(resolver.resolve("request.path")).toBe("/extracted/path");
    });

    it("should override URL-extracted path when metadata path is not /", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/original/path");
      expect(resolver.resolve("request.path")).toBe("/original/path");

      resolver.setRequestMetadata({}, "GET", "/override/path");
      expect(resolver.resolve("request.path")).toBe("/override/path");
    });

    it("should update scheme from metadata", () => {
      resolver.extractRuntimePropertiesFromUrl("https://example.com/path");
      expect(resolver.resolve("request.scheme")).toBe("https");

      resolver.setRequestMetadata({}, "GET", undefined, "http");
      expect(resolver.resolve("request.scheme")).toBe("http");
    });
  });

  describe("Complex scenarios", () => {
    it("should handle complete request/response cycle", () => {
      // Setup request
      resolver.extractRuntimePropertiesFromUrl("https://api.example.com:443/v1/users/123.json?include=profile");
      resolver.setRequestMetadata(
        {
          "content-type": "application/json",
          "authorization": "Bearer token123",
          "x-request-id": "req-456"
        },
        "GET"
      );
      resolver.setProperty("user.id", "123");
      resolver.setProperty("api.version", "v1");

      // Verify request properties
      expect(resolver.resolve("request.url")).toBe("https://api.example.com:443/v1/users/123.json?include=profile");
      // Port 443 is default for HTTPS, so URL parser omits it
      expect(resolver.resolve("request.host")).toBe("api.example.com");
      expect(resolver.resolve("request.path")).toBe("/v1/users/123.json");
      expect(resolver.resolve("request.query")).toBe("include=profile");
      expect(resolver.resolve("request.method")).toBe("GET");
      expect(resolver.resolve("request.scheme")).toBe("https");
      expect(resolver.resolve("request.extension")).toBe("json");
      expect(resolver.resolve("request.headers.content-type")).toBe("application/json");
      expect(resolver.resolve("request.headers.authorization")).toBe("Bearer token123");
      expect(resolver.resolve("user.id")).toBe("123");
      expect(resolver.resolve("api.version")).toBe("v1");

      // Setup response
      resolver.setResponseMetadata(
        {
          "content-type": "application/json",
          "cache-control": "max-age=3600",
          "x-response-time": "45ms"
        },
        200,
        "OK"
      );

      // Verify response properties
      expect(resolver.resolve("response.status")).toBe(200);
      expect(resolver.resolve("response.code_details")).toBe("OK");
      expect(resolver.resolve("response.headers.content-type")).toBe("application/json");
      expect(resolver.resolve("response.headers.cache-control")).toBe("max-age=3600");
      expect(resolver.resolve("response.headers.x-response-time")).toBe("45ms");
    });

    it("should handle property override precedence correctly", () => {
      // Set URL-extracted properties
      resolver.extractRuntimePropertiesFromUrl("https://original.com/path");
      expect(resolver.resolve("request.host")).toBe("original.com");

      // Override with user property
      resolver.setProperty("request.host", "overridden.com");
      expect(resolver.resolve("request.host")).toBe("overridden.com");

      // Verify it appears in getAllProperties
      const allProps = resolver.getAllProperties();
      expect(allProps["request.host"]).toBe("overridden.com");
    });

    it("should support multiple property resolution strategies", () => {
      resolver.setProperties({
        "flat.key": "flat-value",
        "nested": {
          "key": "nested-value"
        },
        "null\0separated": "null-separated-value"
      });

      // Flat resolution
      expect(resolver.resolve("flat.key")).toBe("flat-value");

      // Nested resolution
      expect(resolver.resolve("nested.key")).toBe("nested-value");

      // Null-separated resolution
      expect(resolver.resolve("null\0separated")).toBe("null-separated-value");
    });

    it("should handle URL changes during request lifecycle", () => {
      // Initial URL
      resolver.extractRuntimePropertiesFromUrl("https://initial.com/path1");
      resolver.setRequestMetadata({}, "GET");
      const props1 = resolver.getAllProperties();
      expect(props1["request.host"]).toBe("initial.com");
      expect(props1["request.path"]).toBe("/path1");

      // URL redirect - when properties are copied to new resolver,
      // user properties take precedence over calculated ones
      const resolver2 = new PropertyResolver();
      resolver2.setProperties(props1); // This sets "request.host" as a user property
      resolver2.extractRuntimePropertiesFromUrl("https://redirect.com/path2");

      // User properties from props1 override the newly calculated values
      const props2 = resolver2.getAllProperties();
      expect(props2["request.host"]).toBe("initial.com"); // User property wins

      // To get new values, extract URL first, then set properties
      const resolver3 = new PropertyResolver();
      resolver3.extractRuntimePropertiesFromUrl("https://redirect.com/path2");
      expect(resolver3.resolve("request.host")).toBe("redirect.com");
      expect(resolver3.resolve("request.path")).toBe("/path2");
    });
  });
});
