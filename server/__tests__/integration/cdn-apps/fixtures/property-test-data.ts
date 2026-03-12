/**
 * Common test data and property definitions for integration tests
 */

export const PROPERTIES_BY_TYPE = {
  READ_WRITE: ['request.url', 'request.host', 'request.path', 'request.query'],
  READ_ONLY: [
    'request.method',
    'request.scheme',
    'request.extension',
    'request.country',
    'request.region',
    'request.city',
    'request.continent',
    'request.asn',
    'response.status',
  ],
  WRITE_ONLY: ['nginx.log_field1'],
  RESPONSE: ['response.status'],
};

export const HOOKS = {
  REQUEST_HEADERS: 'onRequestHeaders',
  REQUEST_BODY: 'onRequestBody',
  RESPONSE_HEADERS: 'onResponseHeaders',
  RESPONSE_BODY: 'onResponseBody',
} as const;

export const DEFAULT_REQUEST_HEADERS = {
  ':method': 'GET',
  ':path': '/test',
  ':authority': 'example.com',
  ':scheme': 'https',
};

export const DEFAULT_RESPONSE_HEADERS = {
  ':status': '200',
  'content-type': 'text/plain',
};

export const DEFAULT_REQUEST_CONFIG = {
  headers: DEFAULT_REQUEST_HEADERS,
  body: '',
  method: 'GET',
  path: '/test',
  scheme: 'https',
};

export const DEFAULT_RESPONSE_CONFIG = {
  headers: DEFAULT_RESPONSE_HEADERS,
  body: '',
};
