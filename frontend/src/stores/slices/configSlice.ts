import { StateCreator } from 'zustand';
import { AppStore, ConfigSlice, ConfigState, TestConfig, CdnRequestConfig, HttpRequestConfig } from '../types';
import { HTTP_WASM_HOST } from './httpWasmSlice';

const DEFAULT_CONFIG_STATE: ConfigState = {
  properties: {},
  calculatedProperties: {},
  dotenv: {
    enabled: false,
    path: null,
  },
  logLevel: 2,
  httpPort: null,
};

export const createConfigSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  ConfigSlice
> = (set, get) => ({
  ...DEFAULT_CONFIG_STATE,

  setProperties: (properties) =>
    set((state) => {
      state.properties = properties;
    }),

  updateProperty: (key, value) =>
    set((state) => {
      state.properties[key] = value;
    }),

  removeProperty: (key) =>
    set((state) => {
      delete state.properties[key];
    }),

  mergeProperties: (properties) =>
    set((state) => {
      Object.assign(state.properties, properties);
    }),

  setDotenvEnabled: (enabled) => {
    set((state) => {
      state.dotenv.enabled = enabled;
      if (enabled) {
        state.expandedPanels['dotenv'] = true;
      } else {
        delete state.expandedPanels['dotenv'];
      }
    });
    // No applyDotenv here — App.tsx reloads WASM when this changes,
    // which re-uploads with the new dotenv state. Calling applyDotenv
    // concurrently would race with the reload and cause redundant server work.
  },

  setDotenvPath: async (path) => {
    set((state) => {
      state.dotenv.path = path;
    });
    const { wasmPath, dotenv } = get();
    if (wasmPath !== null && dotenv.enabled) {
      const { applyDotenv } = await import('../../api');
      await applyDotenv(dotenv.enabled, path);
    }
  },

  setLogLevel: (level) =>
    set((state) => {
      state.logLevel = level;
    }),

  setCalculatedProperties: (properties) =>
    set((state) => {
      state.calculatedProperties = properties;
    }),

  loadFromConfig: (config) =>
    set((state) => {
      state.properties = { ...config.properties };
      state.calculatedProperties = {};
      state.logLevel = config.logLevel ?? 0;
      state.dotenv = {
        enabled: config.dotenv?.enabled ?? false,
        path: config.dotenv?.path ?? null,
      };
      // httpPort applies only to http-wasm configs; for CDN configs clear it
      // so a previously-loaded HTTP pin doesn't leak across loads.
      state.httpPort =
        config.appType === 'http-wasm' ? config.httpPort ?? null : null;

      // Restore request fields into the correct slice based on app type.
      // HTTP configs use `path`, CDN configs use `url`.
      if (config.appType === 'http-wasm') {
        const req = config.request as HttpRequestConfig | CdnRequestConfig;
        state.httpMethod = req.method;
        // Accept either `path` (new) or `url` (legacy) — normalise to full httpUrl
        if ('path' in req) {
          const p = req.path.startsWith('/') ? req.path : '/' + req.path;
          state.httpUrl = HTTP_WASM_HOST.replace(/\/$/, '') + p;
        } else {
          state.httpUrl = req.url;
        }
        state.httpRequestHeaders = { ...req.headers };
        state.httpRequestBody = req.body ?? '';
      } else {
        const req = config.request as CdnRequestConfig;
        state.method = req.method;
        state.url = req.url;
        state.requestHeaders = { ...req.headers };
        state.requestBody = req.body ?? '';
        if (config.response) {
          state.responseHeaders = { ...config.response.headers };
          state.responseBody = config.response.body;
        }
      }
    }),

  exportConfig: () => {
    const state = get();
    const isHttp = state.wasmType === 'http-wasm';

    // Build the correct request shape: `path` for HTTP, `url` for CDN
    let request: TestConfig['request'];
    if (isHttp) {
      // Strip the fixed host prefix to get the path portion
      const hostPrefix = HTTP_WASM_HOST.replace(/\/$/, '');
      const httpPath = state.httpUrl.startsWith(hostPrefix)
        ? state.httpUrl.slice(hostPrefix.length) || '/'
        : state.httpUrl;
      request = {
        method: state.httpMethod,
        path: httpPath,
        headers: { ...state.httpRequestHeaders },
        body: state.httpRequestBody,
      };
    } else {
      request = {
        method: state.method,
        url: state.url,
        headers: { ...state.requestHeaders },
        body: state.requestBody,
      };
    }

    const config: TestConfig = {
      appType: state.wasmType ?? 'proxy-wasm',
      request,
      properties: { ...state.properties },
      logLevel: state.logLevel,
      dotenv: {
        enabled: state.dotenv.enabled,
        ...(state.dotenv.path ? { path: state.dotenv.path } : {}),
      },
    };

    // Only emit httpPort for HTTP apps (the schema rejects it elsewhere)
    if (isHttp && state.httpPort !== null) {
      config.httpPort = state.httpPort;
    }

    // CDN apps have a configurable mock response; HTTP apps don't
    if (!isHttp) {
      config.response = {
        headers: { ...state.responseHeaders },
        body: state.responseBody,
      };
    }

    if (state.wasmPath) {
      config.wasm = {
        path: state.wasmPath,
        description: 'Current loaded WASM binary',
      };
    }

    return config;
  },

  resetConfig: () =>
    set((state) => {
      Object.assign(state, DEFAULT_CONFIG_STATE);
    }),
});
