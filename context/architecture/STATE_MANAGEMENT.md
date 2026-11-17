# State Management (Zustand)

The fastedge-test frontend keeps its state in one Zustand store, `useAppStore` (`frontend/src/stores/`), built from slices. Component-local UI state (a draft field, an open dropdown) stays in `useState`; anything shared between components, set from WebSocket events, or saved to a config file lives in the store.

Multi-app resource and Storage Explorer state is local to `views/ResourceView` and `views/StorageExplorerView` (and `App.tsx` for the loaded resource), not in the store.

---

## Why Zustand

- **Little boilerplate**: no actions/reducers/providers; a slice is a function returning state and actions
- **Selective subscriptions**: a component re-renders only when the state it selects changes (Context + `useState` re-renders every consumer)
- **TypeScript-first**: full inference from `AppStore`
- **Middleware**: Immer (mutable-style updates), persist, Redux DevTools
- **Testable**: the store is usable outside React (`useAppStore.getState()`)

---

## Store Structure

```
frontend/src/stores/
├── index.ts              # useAppStore: slices + middleware
├── types.ts              # State, action and slice types; AppStore; TestConfig
└── slices/
    ├── requestSlice.ts   # CDN request: method, url, headers, body
    ├── wasmSlice.ts      # Loaded WASM: path, type, loading, error, load timing
    ├── resultsSlice.ts   # CDN hook results and final response
    ├── configSlice.ts    # Properties, calculated properties, dotenv, log level, context, origin, config file I/O
    ├── uiSlice.ts        # Hook tabs, expanded panels, WebSocket status, workspace root
    └── httpWasmSlice.ts  # HTTP app: request, response, logs, runner port
```

`AppStore = RequestSlice & WasmSlice & ResultsSlice & ConfigSlice & UISlice & HttpWasmSlice`. Types live in `stores/types.ts`; read it for the exact shapes.

### Middleware Stack

```typescript
create<AppStore>()(
  devtools(                       // Redux DevTools, dev builds only (name: 'ProxyRunnerStore')
    immer(                        // mutable-style updates in set()
      persist(slices, {           // localStorage, key 'proxy-runner-config'
        storage: createDebouncedJSONStorage(localStorage, { debounceTime: 500 }),
        partialize: ...,          // what is written (below)
        version: 1,
      }))));
```

### Slices

| Slice | State | Notable actions |
|---|---|---|
| Request | `method`, `url` (default `http://fastedge-builtin.debug`), `requestHeaders`, `requestBody` | `setMethod`, `setUrl`, `setRequestHeaders`, `setRequestBody`, `updateRequestHeader`, `removeRequestHeader`, `resetRequest` |
| WASM | `wasmPath`, `wasmBuffer`, `wasmFile`, `wasmType` (`proxy-wasm` / `http-wasm`), `loading`, `error`, `loadingMode` (`path` / `buffer`), `loadTime`, `fileSize` | `loadWasm(fileOrPath, dotenvEnabled, dotenvPath?)`, `reloadWasm`, `clearWasm`, `setWasmLoaded` (another client loaded it) |
| Results | `hookResults`, `finalResponse`, `isExecuting` | `setHookResult`, `setHookResults`, `setFinalResponse`, `clearResults` |
| Config | `properties`, `calculatedProperties`, `dotenv { enabled, path }`, `logLevel`, `httpPort`, `stores`, `dc`, `client`, `edge`, `origin` | `setProperties`, `updateProperty`, `removeProperty`, `mergeProperties`, `setCalculatedProperties`, `setDotenvEnabled`, `setDotenvPath`, `setLogLevel`, `setClient`, `setEdge`, `setOrigin`, `loadFromConfig`, `exportConfig`, `resetConfig` |
| UI | `activeHookTab`, `activeSubView` (`logs` / `inputs` / `outputs`), `expandedPanels`, `wsStatus`, `workspaceRoot` | `setActiveHookTab`, `setActiveSubView`, `togglePanel`, `setPanelExpanded`, `setWsStatus`, `setWorkspaceRoot` |
| HTTP WASM | `httpMethod`, `httpUrl` (host prefix fixed), `httpRequestHeaders`, `httpRequestBody`, `httpResponse`, `httpLogs`, `httpIsExecuting`, `httpRunnerPort` | `executeHttpRequest`, `appendHttpLogs`, `setHttpRunnerPort`, `clearHttpResponse`, `resetHttpWasm` |

### Properties vs calculated properties

- `properties` are the user's editable properties (sent with every run, saved in config files).
- `calculatedProperties` are the URL-derived `request.*` values the server returns after a run (`/api/send` result or the `request_completed` WebSocket event). `ProxyWasmView` stores them with `setCalculatedProperties`; they are shown read-only (each hook's Inputs) and are **never merged into `properties`**. Merging them would feed stale calculated values back into the next request as explicit properties.
- `mergeProperties` is for user/agent property updates arriving over WebSocket (`properties_updated`).

### Config file I/O

`loadFromConfig(config)` applies a `fastedge-config.test.json` (request, properties, log level, dotenv, httpPort, stores, dc, client, edge, origin; HTTP apps get `request.path` into `httpUrl`). `exportConfig()` builds a `TestConfig` from the store, choosing the CDN (`url`) or HTTP (`path`) request shape by `wasmType`. See [CONFIG_SHARING.md](../features/CONFIG_SHARING.md).

---

## Persistence

`partialize` writes, under the key `proxy-runner-config`, debounced 500 ms:

```typescript
{
  request: { method, url, requestHeaders, requestBody },
  config:  { properties, dotenv, logLevel },
  ui:      { expandedPanels },
}
```

Everything else is ephemeral: the loaded WASM (it must be reloaded), results, calculated properties, loading/error state, WebSocket status, active tabs, context and origin (those come from config files).

The persisted object is nested (`request` / `config` / `ui`) and the store defines no custom `merge`, so persist's default shallow merge does not map these back onto the slice fields on reload. The config file (`fastedge-config.test.json`), not localStorage, is the reliable way to keep a setup.

---

## Using the Store

```typescript
// Destructure what the component needs (the common pattern in views)
const { method, url, setMethod, setUrl } = useAppStore();

// Selector: re-render only when this value changes
const logLevel = useAppStore((s) => s.logLevel);

// Outside React (event handlers, WebSocket callbacks, tests)
useAppStore.getState().setHookResults(results);
```

- Async actions (`loadWasm`, `reloadWasm`, `setDotenvPath`, `executeHttpRequest`) set `loading` / `error` / `httpIsExecuting` themselves.
- Slices read each other through `get()` (for example `exportConfig` reads `wasmType`).
- With Immer, update nested state by mutation inside `set((state) => { ... })`.

---

## Adding New State

1. Add the field and its action to the slice's `State` / `Actions` interfaces in `stores/types.ts`.
2. Add the default to the slice's `DEFAULT_*_STATE` and implement the action with `set((state) => { ... })`.
3. If it belongs in config files, handle it in `loadFromConfig` / `exportConfig` (and the server's `TestConfigSchema`).
4. If it should be written to localStorage, add it to `partialize` and to `PersistConfig`.
5. Add tests to the slice's `*.test.ts`.

A new slice: create `slices/<name>Slice.ts` with a `StateCreator<AppStore, [['zustand/immer', never]], [], <Name>Slice>`, add its type to `AppStore`, and spread it into the store in `index.ts`.

---

## Testing Stores

Slice tests are in `stores/slices/*.test.ts`, store-level tests in `stores/index.test.ts`.

```typescript
beforeEach(() => {
  window.localStorage.clear();
  const { result } = renderHook(() => useAppStore());
  act(() => {
    result.current.resetRequest();
    result.current.resetConfig();
  });
});

it('sets the method', () => {
  const { result } = renderHook(() => useAppStore());
  act(() => result.current.setMethod('POST'));
  expect(result.current.method).toBe('POST');
});
```

- Reset the slices you touch in `beforeEach`; the store is a module singleton.
- Mock the API module (`vi.mock('../../api')`) for async actions.
- Test behaviour through actions and resulting state, not implementation details.

---

## Best Practices

1. **Select narrowly** in hot components; destructuring the whole store re-renders on any change.
2. **Group related updates** in one action (one `set`) rather than several calls.
3. **Keep slices focused** on one domain.
4. **Don't store derived state**; compute it (for example `wasmLoaded = wasmPath !== null`).
5. **Never merge server-calculated values into user state** (see calculated properties).

---

## Troubleshooting

- **Component not re-rendering**: the value is read via `getState()` instead of the hook, or an object is replaced with the same reference outside Immer.
- **Infinite re-render loop**: an action called during render, or a selector returning a new object each time (select primitives or use `useShallow`).
- **Stale value in a callback**: read with `useAppStore.getState()` inside the callback instead of a captured variable.
- **Tests leaking state**: missing reset in `beforeEach`, or localStorage not cleared.
- **DevTools empty**: DevTools are enabled only in dev builds (`import.meta.env.DEV`).

---

## Related Documentation

- [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) - Pages and components
- [TEST_PATTERNS.md](../development/TEST_PATTERNS.md) - Testing strategies
- [IMPLEMENTATION_GUIDE.md](../development/IMPLEMENTATION_GUIDE.md) - Development workflows
- [WEBSOCKET_IMPLEMENTATION.md](../features/WEBSOCKET_IMPLEMENTATION.md) - WebSocket events that update the store
