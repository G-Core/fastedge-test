export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy"; // this exports the required functions for the proxy to interact with us.
import {
  BufferTypeValues,
  Context,
  FilterDataStatusValues,
  FilterHeadersStatusValues,
  get_buffer_bytes,
  log,
  LogLevelValues,
  registerRootContext,
  RootContext,
  set_buffer_bytes,
  stream_context,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";
import { setLogLevel } from "@gcoredev/proxy-wasm-sdk-as/assembly/fastedge";

import { injectFieldIntoJsonBody } from "../../as_utils/assembly/jsonBody";

class HttpHeadersRoot extends RootContext {
  createContext(context_id: u32): Context {
    setLogLevel(LogLevelValues.debug); // Set the log level to info - for more logging reduce this to LogLevelValues.debug
    return new HttpHeaders(context_id, this);
  }
}

class HttpHeaders extends Context {
  constructor(context_id: u32, root_context: HttpHeadersRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(
      LogLevelValues.debug,
      'onRequestHeaders >> injecting header { "x-custom-request", "I am injected from onRequestHeaders" }',
    );

    // Add custom header to the request
    stream_context.headers.request.add(
      "x-custom-request",
      "I am injected from onRequestHeaders",
    );

    // Check if we need to modify the request body (x-inject-req-body header exists and content-type is JSON)
    const injectHeader =
      stream_context.headers.request.get("x-inject-req-body");
    const contentType = stream_context.headers.request.get("content-type");
    const isJsonContent =
      contentType !== null && contentType.includes("application/json");

    if (injectHeader !== "" && isJsonContent) {
      // Remove content-length header as we will modify the body
      stream_context.headers.request.remove("content-length");
      log(
        LogLevelValues.debug,
        "onRequestHeaders >> Removed content-length for body modification",
      );
    }

    return FilterHeadersStatusValues.Continue;
  }

  onRequestBody(
    body_buffer_length: usize,
    end_of_stream: bool,
  ): FilterDataStatusValues {
    log(LogLevelValues.debug, "onRequestBody >>" + end_of_stream.toString());

    if (!end_of_stream) {
      // Wait until the complete body is buffered
      return FilterDataStatusValues.StopIterationAndBuffer;
    }

    // Check for x-inject-req-body header directly (each hook runs in its own sandbox)
    const injectHeader =
      stream_context.headers.request.get("x-inject-req-body");

    // Check if Content-Type is application/json
    const contentType = stream_context.headers.request.get("content-type");
    const isJsonContent =
      contentType !== null && contentType.includes("application/json");

    // If we have a header to inject and content is JSON, modify the body
    if (injectHeader !== "" && isJsonContent) {
      // Retrieve the body from the HttpRequestBody buffer
      const bodyBytes = get_buffer_bytes(
        BufferTypeValues.HttpRequestBody,
        0,
        <u32>body_buffer_length,
      );

      if (bodyBytes.byteLength > 0) {
        // Use utility function to inject field into JSON body
        const modifiedBytes = injectFieldIntoJsonBody(
          bodyBytes,
          "x-inject-req-body",
          injectHeader,
        );

        // Set the modified body
        set_buffer_bytes(
          BufferTypeValues.HttpRequestBody,
          0,
          <u32>body_buffer_length,
          modifiedBytes,
        );

        log(
          LogLevelValues.debug,
          "onRequestBody >> Injected x-inject-req-body into request body",
        );
      }
    }

    return FilterDataStatusValues.Continue;
  }

  onResponseHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(
      LogLevelValues.debug,
      'onResponseHeaders >> injecting header { "x-custom-response", "I am injected from onResponseHeaders" }',
    );

    // Add custom header to the response
    stream_context.headers.response.add(
      "x-custom-response",
      "I am injected from onResponseHeaders",
    );

    // Check if we need to modify the response body (x-inject-res-body header exists and content-type is JSON)
    const injectHeader =
      stream_context.headers.request.get("x-inject-res-body");
    const contentType = stream_context.headers.response.get("content-type");
    const isJsonContent =
      contentType !== null && contentType.includes("application/json");

    if (injectHeader && injectHeader !== "" && isJsonContent) {
      // Remove content-length header as we will modify the body
      stream_context.headers.response.remove("content-length");
      log(
        LogLevelValues.debug,
        "onResponseHeaders >> Removed content-length for body modification",
      );
    }

    return FilterHeadersStatusValues.Continue;
  }

  onResponseBody(
    body_buffer_length: usize,
    end_of_stream: bool,
  ): FilterDataStatusValues {
    log(LogLevelValues.debug, "onResponseBody >>" + end_of_stream.toString());

    if (!end_of_stream) {
      // Wait until the complete body is buffered
      return FilterDataStatusValues.StopIterationAndBuffer;
    }

    // Check for x-inject-res-body header directly (each hook runs in its own sandbox)
    const injectHeader =
      stream_context.headers.request.get("x-inject-res-body");

    // Check if Content-Type is application/json
    const contentType = stream_context.headers.response.get("content-type");
    const isJsonContent =
      contentType !== null && contentType.includes("application/json");

    // If we have a header to inject and content is JSON, modify the body
    if (injectHeader && injectHeader !== "" && isJsonContent) {
      // Retrieve the body from the HttpResponseBody buffer
      const bodyBytes = get_buffer_bytes(
        BufferTypeValues.HttpResponseBody,
        0,
        <u32>body_buffer_length,
      );

      if (bodyBytes.byteLength > 0) {
        // Use utility function to inject field into JSON body
        const modifiedBytes = injectFieldIntoJsonBody(
          bodyBytes,
          "x-inject-res-body",
          injectHeader,
        );

        // Set the modified body
        set_buffer_bytes(
          BufferTypeValues.HttpResponseBody,
          0,
          <u32>body_buffer_length,
          modifiedBytes,
        );

        log(
          LogLevelValues.debug,
          "onResponseBody >> Injected x-inject-res-body into response body",
        );
      }
    }

    return FilterDataStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new HttpHeadersRoot(context_id);
}, "httpheaders");
