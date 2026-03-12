async function app(event: FetchEvent): Promise<Response> {
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
