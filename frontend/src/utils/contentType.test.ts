import { describe, it, expect } from "vitest";
import { applyDefaultContentType } from "./contentType";

describe("applyDefaultContentType", () => {
  describe("JSON content detection", () => {
    it("should detect JSON object", () => {
      const headers = {};
      const body = '{"name": "test", "value": 123}';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/json");
    });

    it("should detect JSON array", () => {
      const headers = {};
      const body = '[{"id": 1}, {"id": 2}]';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/json");
    });

    it("should detect JSON object with leading whitespace", () => {
      const headers = {};
      const body = '  \n  {"name": "test"}';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/json");
    });

    it("should detect JSON array with leading whitespace", () => {
      const headers = {};
      const body = '\t\n[1, 2, 3]';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/json");
    });
  });

  describe("HTML content detection", () => {
    it("should detect HTML with DOCTYPE", () => {
      const headers = {};
      const body = '<!DOCTYPE html><html><body>Test</body></html>';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/html");
    });

    it("should detect HTML with DOCTYPE (case insensitive)", () => {
      const headers = {};
      const body = '<!doctype HTML><html><body>Test</body></html>';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/html");
    });

    it("should detect HTML with <html> tag", () => {
      const headers = {};
      const body = '<html><head><title>Test</title></head></html>';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/html");
    });

    it("should detect HTML with <html> tag (case insensitive)", () => {
      const headers = {};
      const body = '<HTML lang="en"><body>Content</body></HTML>';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/html");
    });

    it("should detect HTML with generic XML tag", () => {
      const headers = {};
      const body = '<div>Some content</div>';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/html");
    });
  });

  describe("XML content detection", () => {
    it("should detect XML with XML declaration", () => {
      const headers = {};
      const body = '<?xml version="1.0" encoding="UTF-8"?><root><item>test</item></root>';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/xml");
    });

    it("should detect XML with XML declaration and whitespace", () => {
      const headers = {};
      const body = '  <?xml version="1.0"?>\n<root></root>';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/xml");
    });
  });

  describe("Plain text detection", () => {
    it("should detect plain text", () => {
      const headers = {};
      const body = 'This is just plain text content';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/plain");
    });

    it("should detect plain text with numbers", () => {
      const headers = {};
      const body = '12345';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/plain");
    });

    it("should detect plain text starting with letters that might look like tags", () => {
      const headers = {};
      const body = 'name=value&key=data';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/plain");
    });
  });

  describe("Edge cases", () => {
    it("should not override existing content-type header", () => {
      const headers = { "content-type": "application/custom" };
      const body = '{"name": "test"}';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/custom");
    });

    it("should not add content-type for empty body", () => {
      const headers = {};
      const body = "";
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBeUndefined();
    });

    it("should not add content-type for whitespace-only body", () => {
      const headers = {};
      const body = "   \n\t  ";
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBeUndefined();
    });

    it("should preserve other headers", () => {
      const headers = {
        "authorization": "Bearer token123",
        "x-custom-header": "custom-value",
      };
      const body = '{"test": true}';
      const result = applyDefaultContentType(headers, body);

      expect(result["authorization"]).toBe("Bearer token123");
      expect(result["x-custom-header"]).toBe("custom-value");
      expect(result["content-type"]).toBe("application/json");
    });

    it("should not mutate original headers object", () => {
      const headers = { "authorization": "Bearer token" };
      const body = '{"test": true}';
      applyDefaultContentType(headers, body);

      expect(headers["content-type"]).toBeUndefined();
    });

    it("should handle content-type with different casing", () => {
      const headers = { "Content-Type": "application/custom" };
      const body = '{"test": true}';
      const result = applyDefaultContentType(headers, body);

      // Should not add content-type since Content-Type exists
      // Note: The function checks for lowercase "content-type" only
      expect(result["content-type"]).toBe("application/json");
      expect(result["Content-Type"]).toBe("application/custom");
    });
  });

  describe("Complex body content", () => {
    it("should detect minified JSON", () => {
      const headers = {};
      const body = '{"user":{"id":1,"name":"test","active":true}}';
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/json");
    });

    it("should detect formatted JSON with newlines", () => {
      const headers = {};
      const body = `{
  "user": {
    "id": 1,
    "name": "test"
  }
}`;
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/json");
    });

    it("should detect complex HTML document", () => {
      const headers = {};
      const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
</head>
<body>
  <div class="container">Content</div>
</body>
</html>`;
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("text/html");
    });

    it("should detect SOAP XML", () => {
      const headers = {};
      const body = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <m:GetUser xmlns:m="http://example.com/users">
      <m:UserId>123</m:UserId>
    </m:GetUser>
  </soap:Body>
</soap:Envelope>`;
      const result = applyDefaultContentType(headers, body);

      expect(result["content-type"]).toBe("application/xml");
    });
  });
});
