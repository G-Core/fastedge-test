import { StateCreator } from 'zustand';
import { AppStore, RequestSlice, RequestState } from '../types';

const DEFAULT_REQUEST_STATE: RequestState = {
  method: 'POST',
  url: 'https://cdn-origin-4732724.fastedge.cdn.gc.onl/',
  requestHeaders: {},
  requestBody: '{"message": "Hello"}',
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"response": "OK"}',
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
      state.isDirty = true;
    }),

  setUrl: (url) =>
    set((state) => {
      state.url = url;
      state.isDirty = true;
    }),

  setRequestHeaders: (headers) =>
    set((state) => {
      state.requestHeaders = headers;
      state.isDirty = true;
    }),

  setRequestBody: (body) =>
    set((state) => {
      state.requestBody = body;
      state.isDirty = true;
    }),

  setResponseHeaders: (headers) =>
    set((state) => {
      state.responseHeaders = headers;
      state.isDirty = true;
    }),

  setResponseBody: (body) =>
    set((state) => {
      state.responseBody = body;
      state.isDirty = true;
    }),

  updateRequestHeader: (key, value) =>
    set((state) => {
      state.requestHeaders[key] = value;
      state.isDirty = true;
    }),

  removeRequestHeader: (key) =>
    set((state) => {
      delete state.requestHeaders[key];
      state.isDirty = true;
    }),

  updateResponseHeader: (key, value) =>
    set((state) => {
      state.responseHeaders[key] = value;
      state.isDirty = true;
    }),

  removeResponseHeader: (key) =>
    set((state) => {
      delete state.responseHeaders[key];
      state.isDirty = true;
    }),

  resetRequest: () =>
    set((state) => {
      Object.assign(state, DEFAULT_REQUEST_STATE);
      state.isDirty = true;
    }),
});
