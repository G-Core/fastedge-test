/**
 * Applies default content-type header based on request body content if not already set.
 * Mimics Postman's automatic content-type detection behavior.
 *
 * @param headers - The current request headers
 * @param body - The request body to analyze
 * @returns Updated headers with content-type if it was auto-detected
 */
export function applyDefaultContentType(
  headers: Record<string, string>,
  body: string,
): Record<string, string> {
  const finalHeaders = { ...headers };

  // Only auto-calculate if content-type is not present in headers
  if (!finalHeaders["content-type"] && body.trim()) {
    const trimmedBody = body.trim();
    const lowerBody = trimmedBody.toLowerCase();

    // Try to detect content type from body
    if (trimmedBody.startsWith("{") || trimmedBody.startsWith("[")) {
      finalHeaders["content-type"] = "application/json";
    } else if (
      lowerBody.startsWith("<!doctype html") ||
      lowerBody.startsWith("<html")
    ) {
      finalHeaders["content-type"] = "text/html";
    } else if (trimmedBody.startsWith("<?xml")) {
      finalHeaders["content-type"] = "application/xml";
    } else if (trimmedBody.startsWith("<")) {
      // Generic XML/HTML - default to HTML as it's more common in testing
      finalHeaders["content-type"] = "text/html";
    } else {
      finalHeaders["content-type"] = "text/plain";
    }
  }

  return finalHeaders;
}
