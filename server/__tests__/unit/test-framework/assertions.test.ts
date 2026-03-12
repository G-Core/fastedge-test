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
} from '../../../test-framework/assertions';
import type { HookResult, FullFlowResult } from '../../../runner/types';

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
