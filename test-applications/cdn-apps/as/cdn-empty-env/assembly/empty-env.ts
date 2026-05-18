export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  Context,
  FilterHeadersStatusValues,
  log,
  LogLevelValues,
  registerRootContext,
  RootContext,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";
import { getEnv } from "@gcoredev/proxy-wasm-sdk-as/assembly/fastedge";

class EmptyEnvRoot extends RootContext {
  createContext(context_id: u32): Context {
    return new EmptyEnv(context_id, this);
  }
}

class EmptyEnv extends Context {
  constructor(context_id: u32, root_context: EmptyEnvRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    const value = getEnv("MISSING_KEY");
    log(LogLevelValues.info, "empty-env >> MISSING_KEY=\"" + value + "\"");
    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new EmptyEnvRoot(context_id);
}, "empty-env");
