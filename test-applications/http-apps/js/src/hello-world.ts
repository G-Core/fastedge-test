async function eventHandler(event: FetchEvent): Promise<Response> {
  const request = event.request;
  console.log("test-logging-string");
  return new Response(`Hello, you made a request to ${request.url}`);
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
