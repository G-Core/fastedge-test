import {
  Headers,
  log,
  LogLevelValues,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";

function collectHeaders(
  headers: Headers,
  logHeaders: bool = true
): Set<string> {
  // Iterate over headers adding them to the returned set and log them if required
  const set = new Set<string>();
  for (let i = 0; i < headers.length; i++) {
    const name = String.UTF8.decode(headers[i].key);
    const value = String.UTF8.decode(headers[i].value);
    if (logHeaders) log(LogLevelValues.info, `#header -> ${name}: ${value}`);
    set.add(`${name}:${value}`);
  }
  return set;
}

export { collectHeaders };
