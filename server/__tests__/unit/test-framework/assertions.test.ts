import { describe, it, expect } from 'vitest';
import {
  assertRequestHeader,
  assertNoRequestHeader,
  assertResponseHeader,
  assertNoResponseHeader,
  assertFinalStatus,
  assertFinalHeader,
  assertReturnCode,
  assertLog,
  assertNoLog,
  logsContain,
  hasPropertyAccessViolation,
  assertPropertyAllowed,
  assertPropertyDenied,
  assertHttpStatus,
  assertHttpHeader,
  assertHttpNoHeader,
  assertHttpBody,
  assertHttpBodyContains,
  assertHttpJson,
  assertHttpContentType,
  assertHttpLog,
  assertHttpNoLog,
} from '../../../test-framework/assertions';
import type { HookResult, FullFlowResult } from '../../../runner/types';
import type { HttpResponse } from '../../../runner/IWasmRunner';

// ─── Minimal mock builders ────────────────────────────────────────────────────

function makeHookResult(overrides: Partial<HookResult> = {}): HookResult {
  return {
    returnCode: 0,
    logs: [],
    input: { request: { headers: {}, body: '' }, response: { headers: {}, body: '' } },
    output: { request: { headers: {}, body: '' }, response: { headers: {}, body: '' } },
    properties: {},
    ...overrides,
  };
}

function makeFullFlowResult(overrides: Partial<FullFlowResult> = {}): FullFlowResult {
  return {
    hookResults: {},
    finalResponse: {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '',
      contentType: 'text/plain',
    },
    ...overrides,
  };
}

// ─── assertRequestHeader ──────────────────────────────────────────────────────

describe('assertRequestHeader', () => {
  it('passes when header is present', () => {
    const result = makeHookResult({ output: { request: { headers: { 'x-foo': 'bar' }, body: '' }, response: { headers: {}, body: '' } } });
    expect(() => assertRequestHeader(result, 'x-foo')).not.toThrow();
  });

  it('passes when header matches expected value', () => {
    const result = makeHookResult({ output: { request: { headers: { 'x-foo': 'bar' }, body: '' }, response: { headers: {}, body: '' } } });
    expect(() => assertRequestHeader(result, 'x-foo', 'bar')).not.toThrow();
  });

  it('throws when header is missing', () => {
    const result = makeHookResult();
    expect(() => assertRequestHeader(result, 'x-foo')).toThrow("request header 'x-foo' to be set");
  });

  it('throws when header value does not match', () => {
    const result = makeHookResult({ output: { request: { headers: { 'x-foo': 'actual' }, body: '' }, response: { headers: {}, body: '' } } });
    expect(() => assertRequestHeader(result, 'x-foo', 'expected')).toThrow("'expected', got 'actual'");
  });
});

// ─── assertNoRequestHeader ────────────────────────────────────────────────────

describe('assertNoRequestHeader', () => {
  it('passes when header is absent', () => {
    const result = makeHookResult();
    expect(() => assertNoRequestHeader(result, 'x-foo')).not.toThrow();
  });

  it('throws when header is present', () => {
    const result = makeHookResult({ output: { request: { headers: { 'x-foo': 'bar' }, body: '' }, response: { headers: {}, body: '' } } });
    expect(() => assertNoRequestHeader(result, 'x-foo')).toThrow("'x-foo' to be absent");
  });
});

// ─── assertResponseHeader ─────────────────────────────────────────────────────

describe('assertResponseHeader', () => {
  it('passes when header is present', () => {
    const result = makeHookResult({ output: { request: { headers: {}, body: '' }, response: { headers: { 'cache-control': 'no-store' }, body: '' } } });
    expect(() => assertResponseHeader(result, 'cache-control')).not.toThrow();
  });

  it('throws when header is missing', () => {
    const result = makeHookResult();
    expect(() => assertResponseHeader(result, 'cache-control')).toThrow("response header 'cache-control' to be set");
  });

  it('throws when value does not match', () => {
    const result = makeHookResult({ output: { request: { headers: {}, body: '' }, response: { headers: { 'cache-control': 'no-cache' }, body: '' } } });
    expect(() => assertResponseHeader(result, 'cache-control', 'no-store')).toThrow("'no-store', got 'no-cache'");
  });
});

// ─── assertNoResponseHeader ───────────────────────────────────────────────────

describe('assertNoResponseHeader', () => {
  it('passes when header is absent', () => {
    const result = makeHookResult();
    expect(() => assertNoResponseHeader(result, 'x-secret')).not.toThrow();
  });

  it('throws when header is present', () => {
    const result = makeHookResult({ output: { request: { headers: {}, body: '' }, response: { headers: { 'x-secret': 'leak' }, body: '' } } });
    expect(() => assertNoResponseHeader(result, 'x-secret')).toThrow("'x-secret' to be absent");
  });
});

// ─── assertFinalStatus ────────────────────────────────────────────────────────

describe('assertFinalStatus', () => {
  it('passes when status matches', () => {
    const result = makeFullFlowResult({ finalResponse: { status: 403, statusText: 'Forbidden', headers: {}, body: '', contentType: null } });
    expect(() => assertFinalStatus(result, 403)).not.toThrow();
  });

  it('throws when status does not match', () => {
    const result = makeFullFlowResult();
    expect(() => assertFinalStatus(result, 404)).toThrow('Expected final response status 404, got 200');
  });
});

// ─── assertFinalHeader ────────────────────────────────────────────────────────

describe('assertFinalHeader', () => {
  it('passes when header is present', () => {
    const result = makeFullFlowResult({ finalResponse: { status: 200, statusText: 'OK', headers: { 'x-added': 'yes' }, body: '', contentType: null } });
    expect(() => assertFinalHeader(result, 'x-added')).not.toThrow();
  });

  it('passes when header matches expected value', () => {
    const result = makeFullFlowResult({ finalResponse: { status: 200, statusText: 'OK', headers: { 'x-added': 'yes' }, body: '', contentType: null } });
    expect(() => assertFinalHeader(result, 'x-added', 'yes')).not.toThrow();
  });

  it('throws when header is missing', () => {
    const result = makeFullFlowResult();
    expect(() => assertFinalHeader(result, 'x-added')).toThrow("'x-added' to be set");
  });
});

// ─── assertReturnCode ─────────────────────────────────────────────────────────

describe('assertReturnCode', () => {
  it('passes when code matches', () => {
    const result = makeHookResult({ returnCode: 1 });
    expect(() => assertReturnCode(result, 1)).not.toThrow();
  });

  it('throws when code does not match', () => {
    const result = makeHookResult({ returnCode: 0 });
    expect(() => assertReturnCode(result, 1)).toThrow('Expected hook return code 1, got 0');
  });
});

// ─── assertLog / assertNoLog / logsContain ────────────────────────────────────

describe('assertLog', () => {
  it('passes when a log contains the substring', () => {
    const result = makeHookResult({ logs: [{ level: 0, message: 'auth token missing' }] });
    expect(() => assertLog(result, 'auth token')).not.toThrow();
  });

  it('throws when no log contains the substring', () => {
    const result = makeHookResult();
    expect(() => assertLog(result, 'auth token')).toThrow("log message containing 'auth token'");
  });
});

describe('assertNoLog', () => {
  it('passes when no log contains the substring', () => {
    const result = makeHookResult({ logs: [{ level: 0, message: 'request processed' }] });
    expect(() => assertNoLog(result, 'error')).not.toThrow();
  });

  it('throws when a log contains the substring', () => {
    const result = makeHookResult({ logs: [{ level: 2, message: 'fatal error occurred' }] });
    expect(() => assertNoLog(result, 'error')).toThrow("no log containing 'error'");
  });
});

describe('logsContain', () => {
  it('returns true when a log contains the substring', () => {
    const result = makeHookResult({ logs: [{ level: 0, message: 'cache hit' }] });
    expect(logsContain(result, 'cache')).toBe(true);
  });

  it('returns false when no log contains the substring', () => {
    const result = makeHookResult();
    expect(logsContain(result, 'cache')).toBe(false);
  });
});

// ─── property access helpers ──────────────────────────────────────────────────

describe('hasPropertyAccessViolation', () => {
  it('returns true when a denial log is present', () => {
    const result = makeHookResult({ logs: [{ level: 1, message: 'Property access denied: request.id' }] });
    expect(hasPropertyAccessViolation(result)).toBe(true);
  });

  it('returns false when no denial log is present', () => {
    const result = makeHookResult();
    expect(hasPropertyAccessViolation(result)).toBe(false);
  });
});

describe('assertPropertyAllowed', () => {
  it('passes when no denial log mentions the path', () => {
    const result = makeHookResult();
    expect(() => assertPropertyAllowed(result, 'request.id')).not.toThrow();
  });

  it('throws when a denial log mentions the path', () => {
    const result = makeHookResult({ logs: [{ level: 1, message: 'Property access denied: request.id' }] });
    expect(() => assertPropertyAllowed(result, 'request.id')).toThrow("'request.id' to be accessible");
  });

  it('does not throw for denial of a different property', () => {
    const result = makeHookResult({ logs: [{ level: 1, message: 'Property access denied: response.body' }] });
    expect(() => assertPropertyAllowed(result, 'request.id')).not.toThrow();
  });
});

describe('assertPropertyDenied', () => {
  it('passes when a denial log mentions the path', () => {
    const result = makeHookResult({ logs: [{ level: 1, message: 'Property access denied: request.id' }] });
    expect(() => assertPropertyDenied(result, 'request.id')).not.toThrow();
  });

  it('throws when no denial log is present', () => {
    const result = makeHookResult();
    expect(() => assertPropertyDenied(result, 'request.id')).toThrow("access to be denied");
  });
});

// ─── HTTP response assertion helpers ─────────────────────────────────────────

function makeHttpResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '',
    contentType: 'text/plain',
    logs: [],
    ...overrides,
  };
}

// ─── assertHttpStatus ────────────────────────────────────────────────────────

describe('assertHttpStatus', () => {
  it('passes when status matches', () => {
    const res = makeHttpResponse({ status: 201 });
    expect(() => assertHttpStatus(res, 201)).not.toThrow();
  });

  it('throws when status does not match', () => {
    const res = makeHttpResponse({ status: 200 });
    expect(() => assertHttpStatus(res, 404)).toThrow('Expected HTTP status 404, got 200');
  });
});

// ─── assertHttpHeader ────────────────────────────────────────────────────────

describe('assertHttpHeader', () => {
  it('passes when header is present', () => {
    const res = makeHttpResponse({ headers: { 'x-foo': 'bar' } });
    expect(() => assertHttpHeader(res, 'x-foo')).not.toThrow();
  });

  it('passes when header matches expected value', () => {
    const res = makeHttpResponse({ headers: { 'x-foo': 'bar' } });
    expect(() => assertHttpHeader(res, 'x-foo', 'bar')).not.toThrow();
  });

  it('matches headers case-insensitively', () => {
    const res = makeHttpResponse({ headers: { 'Content-Type': 'text/html' } });
    expect(() => assertHttpHeader(res, 'content-type', 'text/html')).not.toThrow();
  });

  it('throws when header is missing', () => {
    const res = makeHttpResponse();
    expect(() => assertHttpHeader(res, 'x-foo')).toThrow("header 'x-foo' to be set");
  });

  it('throws when header value does not match', () => {
    const res = makeHttpResponse({ headers: { 'x-foo': 'actual' } });
    expect(() => assertHttpHeader(res, 'x-foo', 'expected')).toThrow("'expected', got 'actual'");
  });
});

// ─── assertHttpNoHeader ──────────────────────────────────────────────────────

describe('assertHttpNoHeader', () => {
  it('passes when header is absent', () => {
    const res = makeHttpResponse();
    expect(() => assertHttpNoHeader(res, 'x-secret')).not.toThrow();
  });

  it('throws when header is present', () => {
    const res = makeHttpResponse({ headers: { 'x-secret': 'leak' } });
    expect(() => assertHttpNoHeader(res, 'x-secret')).toThrow("'x-secret' to be absent");
  });

  it('matches case-insensitively', () => {
    const res = makeHttpResponse({ headers: { 'X-Secret': 'leak' } });
    expect(() => assertHttpNoHeader(res, 'x-secret')).toThrow("'x-secret' to be absent");
  });
});

// ─── assertHttpBody ──────────────────────────────────────────────────────────

describe('assertHttpBody', () => {
  it('passes when body matches exactly', () => {
    const res = makeHttpResponse({ body: 'hello world' });
    expect(() => assertHttpBody(res, 'hello world')).not.toThrow();
  });

  it('throws when body does not match', () => {
    const res = makeHttpResponse({ body: 'hello world' });
    expect(() => assertHttpBody(res, 'goodbye')).toThrow("Expected HTTP body to be 'goodbye'");
  });
});

// ─── assertHttpBodyContains ──────────────────────────────────────────────────

describe('assertHttpBodyContains', () => {
  it('passes when body contains substring', () => {
    const res = makeHttpResponse({ body: 'hello world' });
    expect(() => assertHttpBodyContains(res, 'world')).not.toThrow();
  });

  it('throws when body does not contain substring', () => {
    const res = makeHttpResponse({ body: 'hello world' });
    expect(() => assertHttpBodyContains(res, 'missing')).toThrow("to contain 'missing'");
  });
});

// ─── assertHttpJson ──────────────────────────────────────────────────────────

describe('assertHttpJson', () => {
  it('parses valid JSON and returns it', () => {
    const res = makeHttpResponse({ body: '{"name":"test","value":42}' });
    const json = assertHttpJson(res);
    expect(json).toEqual({ name: 'test', value: 42 });
  });

  it('throws when body is not valid JSON', () => {
    const res = makeHttpResponse({ body: 'not json' });
    expect(() => assertHttpJson(res)).toThrow('Expected HTTP body to be valid JSON');
  });
});

// ─── assertHttpContentType ───────────────────────────────────────────────────

describe('assertHttpContentType', () => {
  it('passes when content-type contains expected string', () => {
    const res = makeHttpResponse({ contentType: 'application/json; charset=utf-8' });
    expect(() => assertHttpContentType(res, 'application/json')).not.toThrow();
  });

  it('matches case-insensitively', () => {
    const res = makeHttpResponse({ contentType: 'Application/JSON' });
    expect(() => assertHttpContentType(res, 'application/json')).not.toThrow();
  });

  it('throws when content-type does not match', () => {
    const res = makeHttpResponse({ contentType: 'text/plain' });
    expect(() => assertHttpContentType(res, 'application/json')).toThrow("to contain 'application/json'");
  });

  it('throws when content-type is null', () => {
    const res = makeHttpResponse({ contentType: null });
    expect(() => assertHttpContentType(res, 'text/plain')).toThrow("to contain 'text/plain'");
  });
});

// ─── assertHttpLog / assertHttpNoLog ─────────────────────────────────────────

describe('assertHttpLog', () => {
  it('passes when a log contains the substring', () => {
    const res = makeHttpResponse({ logs: [{ level: 2, message: 'request processed' }] });
    expect(() => assertHttpLog(res, 'processed')).not.toThrow();
  });

  it('throws when no log contains the substring', () => {
    const res = makeHttpResponse();
    expect(() => assertHttpLog(res, 'missing')).toThrow("log message containing 'missing'");
  });
});

describe('assertHttpNoLog', () => {
  it('passes when no log contains the substring', () => {
    const res = makeHttpResponse({ logs: [{ level: 2, message: 'ok' }] });
    expect(() => assertHttpNoLog(res, 'error')).not.toThrow();
  });

  it('throws when a log contains the substring', () => {
    const res = makeHttpResponse({ logs: [{ level: 4, message: 'fatal error' }] });
    expect(() => assertHttpNoLog(res, 'error')).toThrow("no HTTP log containing 'error'");
  });
});
