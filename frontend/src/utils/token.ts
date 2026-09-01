// Read the session token from the URL fragment (#token=...).
// The token is injected into the URL by the server (CLI) or the VSCode extension (webview),
// never served over HTTP, so it is not readable by a LAN or rebinding attacker.
export function getToken(): string {
  return new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
}
