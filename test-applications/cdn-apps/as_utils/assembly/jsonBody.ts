import { log, LogLevelValues } from "@gcoredev/proxy-wasm-sdk-as/assembly";

/**
 * Injects a field into a JSON body string
 * @param bodyBytes The body bytes to modify
 * @param fieldName The name of the field to inject
 * @param fieldValue The value of the field to inject
 * @returns The modified body as encoded bytes
 */
function injectFieldIntoJsonBody(
  bodyBytes: ArrayBuffer,
  fieldName: string,
  fieldValue: string,
): ArrayBuffer {
  const bodyString = String.UTF8.decode(bodyBytes);
  log(LogLevelValues.debug, `Original body: ${bodyString}`);

  // Manually inject the field into the JSON string
  // Since AssemblyScript doesn't have JSON.parse, we'll do string manipulation
  let modifiedBody = bodyString.trimEnd();

  // Remove trailing } if it exists and add our field
  if (modifiedBody.endsWith("}")) {
    modifiedBody = modifiedBody.slice(0, -1);
    // Check if we need a comma (if JSON object is not empty)
    if (modifiedBody.trimEnd().endsWith("{")) {
      modifiedBody += `"${fieldName}":"${fieldValue}"}`;
    } else {
      modifiedBody += `,"${fieldName}":"${fieldValue}"}`;
    }
  } else {
    // Fallback: just append to the body
    modifiedBody = bodyString + `{"${fieldName}":"${fieldValue}"}`;
  }

  log(LogLevelValues.debug, `Modified body: ${modifiedBody}`);
  return String.UTF8.encode(modifiedBody);
}

export { injectFieldIntoJsonBody };
