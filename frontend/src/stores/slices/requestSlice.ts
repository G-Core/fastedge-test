import { StateCreator } from 'zustand';
import { AppStore, RequestSlice, RequestState } from '../types';

const DEFAULT_REQUEST_STATE: RequestState = {
  method: 'GET',
  url: 'http://fastedge-builtin.debug',
  requestHeaders: {},
  requestBody: '',
  responseHeaders: {},
  responseBody: '',
};

export const createRequestSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  RequestSlice
> = (set) => ({
  ...DEFAULT_REQUEST_STATE,

  setMethod: (method) =>
    set((state) => {
      state.method = method;
    }),

  setUrl: (url) =>
    set((state) => {
      state.url = url;
    }),

  setRequestHeaders: (headers) =>
    set((state) => {
      state.requestHeaders = headers;
    }),

  setRequestBody: (body) =>
    set((state) => {
      state.requestBody = body;
    }),

  setResponseHeaders: (headers) =>
    set((state) => {
      state.responseHeaders = headers;
    }),

  setResponseBody: (body) =>
    set((state) => {
      state.responseBody = body;
    }),

  updateRequestHeader: (key, value) =>
    set((state) => {
      state.requestHeaders[key] = value;
    }),

  removeRequestHeader: (key) =>
    set((state) => {
      delete state.requestHeaders[key];
    }),

  updateResponseHeader: (key, value) =>
    set((state) => {
      state.responseHeaders[key] = value;
    }),

  removeResponseHeader: (key) =>
    set((state) => {
      delete state.responseHeaders[key];
    }),

  resetRequest: () =>
    set((state) => {
      Object.assign(state, DEFAULT_REQUEST_STATE);
    }),
});
