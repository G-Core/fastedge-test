import { StateCreator } from 'zustand';
import { AppStore, ConfigSlice, ConfigState, TestConfig } from '../types';

const DEFAULT_CONFIG_STATE: ConfigState = {
  properties: {},
  dotenvEnabled: true,
  dotenvPath: null,
  logLevel: 2,
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

  setDotenvEnabled: async (enabled) => {
    set((state) => {
      state.dotenvEnabled = enabled;
    });
    const { wasmPath, dotenvPath } = get();
    if (wasmPath !== null) {
      const { applyDotenv } = await import('../../api');
      await applyDotenv(enabled, dotenvPath);
    }
  },

  setDotenvPath: async (path) => {
    set((state) => {
      state.dotenvPath = path;
    });
    const { wasmPath, dotenvEnabled } = get();
    if (wasmPath !== null && dotenvEnabled) {
      const { applyDotenv } = await import('../../api');
      await applyDotenv(dotenvEnabled, path);
    }
  },

  setLogLevel: (level) =>
    set((state) => {
      state.logLevel = level;
    }),

  loadFromConfig: (config) =>
    set((state) => {
      state.properties = { ...config.properties };
      state.logLevel = config.logLevel;
      state.dotenvEnabled = config.dotenvEnabled ?? true;
      state.dotenvPath = config.dotenvPath ?? null;

      // Restore request fields into the correct slice based on app type
      if (config.appType === 'http-wasm') {
        state.httpMethod = config.request.method;
        state.httpUrl = config.request.url;
        state.httpRequestHeaders = { ...config.request.headers };
        state.httpRequestBody = config.request.body;
      } else {
        state.method = config.request.method;
        state.url = config.request.url;
        state.requestHeaders = { ...config.request.headers };
        state.requestBody = config.request.body;
        if (config.response) {
          state.responseHeaders = { ...config.response.headers };
          state.responseBody = config.response.body;
        }
      }
    }),

  exportConfig: () => {
    const state = get();
    const isHttp = state.wasmType === 'http-wasm';

    const config: TestConfig = {
      appType: state.wasmType ?? 'proxy-wasm',
      request: {
        method: isHttp ? state.httpMethod : state.method,
        url: isHttp ? state.httpUrl : state.url,
        headers: isHttp ? { ...state.httpRequestHeaders } : { ...state.requestHeaders },
        body: isHttp ? state.httpRequestBody : state.requestBody,
      },
      properties: { ...state.properties },
      logLevel: state.logLevel,
      dotenvEnabled: state.dotenvEnabled,
      ...(state.dotenvPath ? { dotenvPath: state.dotenvPath } : {}),
    };

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
