import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createDebouncedJSONStorage } from 'zustand-debounce';
import { createRequestSlice } from './slices/requestSlice';
import { createWasmSlice } from './slices/wasmSlice';
import { createResultsSlice } from './slices/resultsSlice';
import { createConfigSlice } from './slices/configSlice';
import { createUISlice } from './slices/uiSlice';
import { createHttpWasmSlice } from './slices/httpWasmSlice';
import type { AppStore, PersistConfig } from './types';

// Create debounced localStorage
const debouncedStorage = createDebouncedJSONStorage(localStorage, {
  delay: 500, // 500ms debounce
});

export const useAppStore = create<AppStore>()(
  devtools(
    immer(
      persist(
        (...args) => ({
          ...createRequestSlice(...args),
          ...createWasmSlice(...args),
          ...createResultsSlice(...args),
          ...createConfigSlice(...args),
          ...createUISlice(...args),
          ...createHttpWasmSlice(...args),
        }),
        {
          name: 'proxy-runner-config',
          storage: debouncedStorage,
          partialize: (state): PersistConfig => ({
            // Only persist user-configurable state
            request: {
              method: state.method,
              url: state.url,
              requestHeaders: state.requestHeaders,
              requestBody: state.requestBody,
              responseHeaders: state.responseHeaders,
              responseBody: state.responseBody,
            },
            config: {
              properties: state.properties,
              dotenvEnabled: state.dotenvEnabled,
              logLevel: state.logLevel,
              autoSave: state.autoSave,
            },
            ui: {
              expandedPanels: state.expandedPanels,
            },
          }),
          version: 1, // For future migrations
        }
      )
    ),
    {
      name: 'ProxyRunnerStore',
      enabled: import.meta.env.DEV, // Enable devtools only in development
    }
  )
);

// Export store type for use in components
export type { AppStore } from './types';
