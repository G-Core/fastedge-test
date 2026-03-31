async function eventHandler(event: FetchEvent): Promise<Response> {
  const request = event.request;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await request.text();
  const json = JSON.parse(body);
  json.processed = true;

  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
