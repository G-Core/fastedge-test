# Request context (client / edge / origin)

Where the client is, which edge POP runs the app, and (CDN apps) where the origin response comes
from. Code: `server/runner/requestContext.ts`; UI: `frontend/src/components/common/RequestContextPanel/`.

## Model

`client` and `edge` are each a preset (`de`, `nl`, `us`) plus field overrides, in config files
(`fastedge-config.test.json`), `RunnerConfig`, and the `/api/load`, `/api/send`, `/api/call` and
`/api/execute` bodies. They expand into the values the runners already take:

| | CDN app (proxy-wasm) | HTTP app |
|---|---|---|
| `client` | `request.*` geo properties (incl. `request.asn`, `request.x_real_ip`); `GeoIP-*` (no country name) and `X-Real-IP` headers | `geoip-*` and `x-real-ip` headers |
| `edge` | dictionary `dc`, `region`, `country`, `city`, `hostname`; `X-ID` header (= hostname) | `dc` and `pop-*` headers |

- **Explicit wins:** properties, request headers (any case) and dotenv dictionary entries win
  over the expansion (`Dictionary.setDefaults` is the fallback layer). The top-level `dc` wins
  over the edge's `dc`.
- **Cache bucket:** `dc ?? edge dc ?? createStores() dc ?? "local"`, fixed at load. Changing the
  edge `dc` in the UI reloads the app (debounced).
- **No block = no change:** old configs and tests run exactly as before. A fresh UI session
  starts with DE for both; a loaded config without the blocks shows "None".
- **Per request:** a body naming `client` or `edge` calls `runner.setRequestContext()` (one left
  out is cleared). The UI always sends both (`{}` for none).
- **One at a time:** the debugger server runs `/api/load`, `/api/send`, `/api/call` and
  `/api/execute` in a queue, so a request's context switch and its run happen together, and
  loads apply in arrival order (an older edge reload cannot win).
- **CDN full flow:** the context is applied once at flow start; hooks inside the flow don't get it
  again (a hook may remove a header).

## Presets

Prod captures (2026-11-13): edge DE = Frankfurt `fr5` (dictionary inferred), NL = Amsterdam `am3`,
US = San Jose `sv5` (`pop-*` coordinates approximate). Client DE / NL / US from `geoip-*`
captures; client IPs are RFC 5737 documentation addresses. Dictionary names differ from header
names on the edge (`Netherlands` vs `The Netherlands`), and the presets keep that difference.

## Origin (CDN UI)

The Origin section edits the built-in responder's `x-debugger-status` / `x-debugger-content`
request headers (status; JSON echo, body only, status only). They are no longer offered as
default request headers, but still work when set by hand.

## UI

The **Request Context** panel replaces the CDN "Server Properties" panel (both views). The CDN
view keeps a raw **Properties** editor inside it; the country presets that used to fill
`properties` are gone. Calculated `request.*` values are in each hook's Inputs.
