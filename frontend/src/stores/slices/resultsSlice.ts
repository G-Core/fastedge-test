import { StateCreator } from 'zustand';
import { AppStore, ResultsSlice, ResultsState } from '../types';

const DEFAULT_RESULTS_STATE: ResultsState = {
  hookResults: {},
  finalResponse: null,
  isExecuting: false,
};

export const createResultsSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  ResultsSlice
> = (set) => ({
  ...DEFAULT_RESULTS_STATE,

  setHookResult: (hook, result) =>
    set((state) => {
      state.hookResults[hook] = result;
    }),

  setHookResults: (results) =>
    set((state) => {
      state.hookResults = results;
    }),

  setFinalResponse: (response) =>
    set((state) => {
      state.finalResponse = response;
    }),

  setIsExecuting: (executing) =>
    set((state) => {
      state.isExecuting = executing;
    }),

  clearResults: () =>
    set((state) => {
      state.hookResults = {};
      state.finalResponse = null;
      state.isExecuting = false;
    }),
});
