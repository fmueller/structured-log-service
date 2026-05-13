import { describe, expect, it } from 'vitest';

import { promoteSemanticAttributes } from '../../src/logs/semanticAttributes';

describe('promoteSemanticAttributes', () => {
  it('returns empty promoted and rest for empty meta', () => {
    const result = promoteSemanticAttributes({});

    expect(result).toEqual({ promoted: {}, rest: {} });
  });

  it('moves a known semantic key into promoted and not into rest', () => {
    const result = promoteSemanticAttributes({ 'http.method': 'GET' });

    expect(result.promoted).toEqual({ 'http.method': 'GET' });
    expect(result.rest).toEqual({});
  });

  it('leaves an unknown key in rest and not in promoted', () => {
    const result = promoteSemanticAttributes({ requestId: 'req-1' });

    expect(result.promoted).toEqual({});
    expect(result.rest).toEqual({ requestId: 'req-1' });
  });

  it('splits a mix of known and unknown keys correctly', () => {
    const meta = { 'http.method': 'POST', requestId: 'req-2', 'order.id': 'ord-99' };
    const result = promoteSemanticAttributes(meta);

    expect(result.promoted).toEqual({ 'http.method': 'POST', 'order.id': 'ord-99' });
    expect(result.rest).toEqual({ requestId: 'req-2' });
  });

  it('aliases meta.service to log.service in promoted and removes it from rest', () => {
    const result = promoteSemanticAttributes({ service: 'svc-a' });

    expect(result.promoted).toEqual({ 'log.service': 'svc-a' });
    expect(result.rest).toEqual({});
  });

  it('prefers meta["log.service"] over meta.service when both are present', () => {
    const result = promoteSemanticAttributes({ service: 'svc-old', 'log.service': 'svc-new' });

    expect(result.promoted['log.service']).toBe('svc-new');
    expect(Object.keys(result.promoted).filter((k) => k === 'log.service')).toHaveLength(1);
    expect(result.rest).toEqual({});
  });

  it('does not promote a known key with value undefined', () => {
    const result = promoteSemanticAttributes({ 'http.method': undefined });

    expect('http.method' in result.promoted).toBe(false);
    expect('http.method' in result.rest).toBe(false);
  });

  it('does not put undefined values into rest for unknown keys', () => {
    const result = promoteSemanticAttributes({ extra: undefined, kept: 'yes' });

    expect('extra' in result.rest).toBe(false);
    expect(result.rest).toEqual({ kept: 'yes' });
  });

  it('does not mutate the input meta object', () => {
    const meta = { 'http.method': 'DELETE', service: 'svc-b', requestId: 'req-3' };
    const original = { ...meta };

    promoteSemanticAttributes(meta);

    expect(meta).toEqual(original);
  });

  it('leaves simulate_processing_failure in rest so the processor can read it', () => {
    const result = promoteSemanticAttributes({ simulate_processing_failure: true });

    expect(result.rest).toEqual({ simulate_processing_failure: true });
    expect('simulate_processing_failure' in result.promoted).toBe(false);
  });
});
