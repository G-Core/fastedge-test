async function app(event: FetchEvent): Promise<Response> {
  const redirectUrl = event.request.headers.get("x-redirect-url");
  if (redirectUrl) {
    return new Response("", {
      status: 302,
      headers: { location: redirectUrl },
    });
  }

  // Set-Cookie regression path: when x-set-cookies is present, emit two
  // Set-Cookie headers. RFC 6265 §3 requires these stay separate — the
  // runner must surface both entries (not a single last-wins string).
  if (event.request.headers.get("x-set-cookies")) {
    const headers = new Headers({ "content-type": "text/plain" });
    headers.append("set-cookie", "sid=abc; Path=/; HttpOnly");
    headers.append("set-cookie", "theme=dark; Path=/");
    return new Response("cookies set", { status: 200, headers });
  }

  const requestUrl = new URL(event.request.url);
  const reqHeaders: Record<string, string> = {};

  event.request.headers.forEach((value, key) => {
    console.log(`Header: ${key} = ${value}`);
    reqHeaders[key] = value;
  });

  return Response.json({
    hello: "http-responder works!",
    method: event.request.method,
    reqHeaders: reqHeaders,
    reqBody: await event.request.text(),
    requestUrl: requestUrl.toString(),
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(app(event));
});
