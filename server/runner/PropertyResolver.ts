import type { HeaderMap } from "./types";

export class PropertyResolver {
  private properties: Record<string, unknown> = {};
  private requestHeaders: HeaderMap = {};
  private requestMethod = "GET";
  private requestPath = "/";
  private requestScheme = "https";
  private requestUrl = "";
  private requestHost = "";
  private requestQuery = "";
  private requestExtension = "";
  private responseHeaders: HeaderMap = {};
  private responseStatus = 200;
  private responseStatusText = "OK";

  setProperties(properties: Record<string, unknown>): void {
    this.properties = properties;
  }

  /**
   * Set a single property (called by proxy_set_property)
   * Allows WASM code to set custom properties at runtime
   */
  setProperty(path: string, value: unknown): void {
    // Normalize path
    const normalizedPath = path.replace(/\0/g, ".");
    this.properties[normalizedPath] = value;
  }

  /**
   * Get all calculated runtime properties
   * These are the properties extracted from the URL and runtime context
   */
  getCalculatedProperties(): Record<string, unknown> {
    return {
      "request.url": this.requestUrl,
      "request.host": this.requestHost,
      "request.path": this.requestPath,
      "request.query": this.requestQuery,
      "request.scheme": this.requestScheme,
      "request.extension": this.requestExtension,
      "request.method": this.requestMethod,
    };
  }

  /**
   * Get all properties merged (user properties + calculated properties)
   * User properties take precedence over calculated ones
   */
  getAllProperties(): Record<string, unknown> {
    const calculated = this.getCalculatedProperties();
    // User properties override calculated ones
    return { ...calculated, ...this.properties };
  }

  setRequestMetadata(
    headers: HeaderMap,
    method: string,
    path?: string,
    scheme?: string,
  ): void {
    this.requestHeaders = headers;
    this.requestMethod = method;
    // Only update path/scheme if explicitly provided (don't overwrite URL-extracted values)
    if (path !== undefined && path !== "/") {
      this.requestPath = path;
    }
    if (scheme !== undefined) {
      this.requestScheme = scheme;
    }
  }

  /**
   * Extract runtime properties from target URL
   * This parses the URL to populate request.url, request.host, request.path, etc.
   */
  extractRuntimePropertiesFromUrl(targetUrl: string): void {
    try {
      const url = new URL(targetUrl);

      // Extract URL components
      this.requestUrl = targetUrl;
      this.requestHost = url.hostname + (url.port ? `:${url.port}` : "");
      this.requestPath = url.pathname || "/";
      this.requestQuery = url.search.startsWith("?")
        ? url.search.substring(1)
        : url.search;
      this.requestScheme = url.protocol.replace(":", "");

      // Extract file extension from path
      const pathParts = this.requestPath.split("/");
      const lastPart = pathParts[pathParts.length - 1];
      const dotIndex = lastPart.lastIndexOf(".");
      if (dotIndex > 0 && dotIndex < lastPart.length - 1) {
        this.requestExtension = lastPart.substring(dotIndex + 1);
      } else {
        this.requestExtension = "";
      }
    } catch (error) {
      // If URL parsing fails, use fallback values
      console.error("Failed to parse target URL:", error);
      this.requestUrl = targetUrl;
      this.requestHost = "localhost";
      this.requestPath = "/";
      this.requestQuery = "";
      this.requestExtension = "";
    }
  }

  setResponseMetadata(
    headers: HeaderMap,
    status: number,
    statusText: string,
  ): void {
    this.responseHeaders = headers;
    this.responseStatus = status;
    this.responseStatusText = statusText;
  }

  resolve(path: string): unknown {
    // Normalize path first
    const normalizedPath = path.replace(/\0/g, ".");

    // Check custom properties first (user-provided values override calculated ones)
    if (Object.prototype.hasOwnProperty.call(this.properties, normalizedPath)) {
      return this.properties[normalizedPath];
    }

    // Also check with original path format
    if (Object.prototype.hasOwnProperty.call(this.properties, path)) {
      return this.properties[path];
    }

    // Check standard request/response properties (calculated/runtime values)
    const standardValue = this.resolveStandard(normalizedPath);
    if (standardValue !== undefined) {
      return standardValue;
    }

    const derivedRootId = this.deriveRootId();
    if (derivedRootId) {
      const normalizedPath = path.replace(/\0/g, "/");
      if (
        normalizedPath === "root_id" ||
        normalizedPath === "plugin_name" ||
        normalizedPath === "plugin_root_id" ||
        normalizedPath === "root_context" ||
        normalizedPath === "root_context_id"
      ) {
        return derivedRootId;
      }
    }

    const segments = path.split("\0").filter((segment) => segment.length > 0);
    if (segments.length > 0) {
      const nested = this.resolvePathSegments(segments);
      if (nested !== undefined) {
        return nested;
      }
      const dotted = segments.join(".");
      if (Object.prototype.hasOwnProperty.call(this.properties, dotted)) {
        return this.properties[dotted];
      }
      const slashed = segments.join("/");
      if (Object.prototype.hasOwnProperty.call(this.properties, slashed)) {
        return this.properties[slashed];
      }
    }

    if (path.includes(".")) {
      const nested = this.resolvePathSegments(path.split("."));
      if (nested !== undefined) {
        return nested;
      }
    }

    return undefined;
  }

  private resolveStandard(path: string): unknown {
    // Request properties (runtime-calculated from URL)
    if (path === "request.method") return this.requestMethod;
    if (path === "request.path") return this.requestPath;
    if (path === "request.url")
      return (
        this.requestUrl ||
        `${this.requestScheme}://${this.requestHost}${this.requestPath}`
      );
    if (path === "request.host")
      return this.requestHost || this.requestHeaders["host"] || "localhost";
    if (path === "request.scheme") return this.requestScheme;
    if (path === "request.protocol") return this.requestScheme;
    if (path === "request.query") return this.requestQuery;
    if (path === "request.extension") return this.requestExtension;
    if (path === "request.content_type") {
      return this.requestHeaders["content-type"] || "";
    }

    // Individual header access (e.g., request.headers.content-type)
    if (path.startsWith("request.headers.")) {
      const headerName = path
        .substring("request.headers.".length)
        .toLowerCase();
      return this.requestHeaders[headerName] || "";
    }

    // Response properties
    if (path === "response.code") return this.responseStatus;
    if (path === "response.status") return this.responseStatus;
    if (path === "response.status_code") return this.responseStatus;
    if (path === "response.code_details") return this.responseStatusText;
    if (path === "response.content_type") {
      return this.responseHeaders["content-type"] || "";
    }

    // Individual response header access (e.g., response.headers.content-type)
    if (path.startsWith("response.headers.")) {
      const headerName = path
        .substring("response.headers.".length)
        .toLowerCase();
      return this.responseHeaders[headerName] || "";
    }

    return undefined;
  }

  private resolvePathSegments(segments: string[]): unknown {
    let current: unknown = this.properties;
    for (const segment of segments) {
      if (segment.length === 0) {
        continue;
      }
      if (
        current &&
        typeof current === "object" &&
        segment in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private deriveRootId(): string | null {
    const candidates = [
      "root_id",
      "rootId",
      "root_context",
      "rootContext",
      "root_context_name",
      "rootContextName",
      "plugin_name",
      "pluginName",
      "context_name",
      "contextName",
    ];
    for (const key of candidates) {
      // Access properties directly to avoid infinite recursion
      const value = this.properties[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return null;
  }
}
