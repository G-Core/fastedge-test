import { describe, it, expect } from 'vitest';
import { newTraceparent } from '../../../runner/HttpWasmRunner';

const W3C = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

describe('newTraceparent', () => {
  it('keeps a valid caller trace id with a fresh parent id on every call', () => {
    const caller = { TraceParent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00' };
    const [a, b] = [newTraceparent(caller), newTraceparent(caller)];
    expect(a).toMatch(/^00-0af7651916cd43dd8448eb211c80319c-[0-9a-f]{16}-00$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(caller.TraceParent);
  });

  it('replaces a missing, invalid or all-zero caller value', () => {
    for (const headers of [{}, { traceparent: 'nope' }, { traceparent: `00-${'0'.repeat(32)}-b7ad6b7169203331-01` }]) {
      expect(newTraceparent(headers)).toMatch(W3C);
      expect(newTraceparent(headers)).not.toContain('0'.repeat(32));
    }
  });
});
