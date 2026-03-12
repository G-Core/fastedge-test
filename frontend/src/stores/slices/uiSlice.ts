import { StateCreator } from 'zustand';
import type { AppStore, UISlice, UIState } from '../types';

// ============================================================================
// DEFAULT STATE
// ============================================================================

const DEFAULT_UI_STATE: UIState = {
  activeHookTab: 'request_headers',
  activeSubView: 'logs',
  expandedPanels: {},
  wsStatus: {
    connected: false,
    reconnecting: false,
    clientCount: 0,
    error: null,
  },
};

// ============================================================================
// SLICE CREATOR
// ============================================================================

export const createUISlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  UISlice
> = (set) => ({
  ...DEFAULT_UI_STATE,

  // Set active hook tab (ephemeral - not persisted)
  setActiveHookTab: (tab) =>
    set((state) => {
      state.activeHookTab = tab;
    }),

  // Set active sub-view (ephemeral - not persisted)
  setActiveSubView: (view) =>
    set((state) => {
      state.activeSubView = view;
    }),

  // Toggle panel expanded state (persisted)
  togglePanel: (panel) =>
    set((state) => {
      // Flip the boolean value for the given panel key
      state.expandedPanels[panel] = !state.expandedPanels[panel];
      // Mark as dirty since expandedPanels is persisted
      state.isDirty = true;
    }),

  // Set WebSocket status (ephemeral - not persisted)
  setWsStatus: (status) =>
    set((state) => {
      state.wsStatus = status;
    }),
});
