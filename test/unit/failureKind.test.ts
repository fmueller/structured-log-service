import { describe, expect, it } from 'vitest';

import { classifyFailureKind } from '../../src/logs/failureKind';
import { TransientProcessingError } from '../../src/logs/transientProcessingError';

describe('classifyFailureKind', () => {
  it('returns "transient" for a TransientProcessingError', () => {
    expect(classifyFailureKind(new TransientProcessingError('x'))).toBe('transient');
  });

  it('returns "permanent" for a plain Error', () => {
    expect(classifyFailureKind(new Error('x'))).toBe('permanent');
  });

  it('returns "permanent" for a string', () => {
    expect(classifyFailureKind('string')).toBe('permanent');
  });

  it('returns "permanent" for null', () => {
    expect(classifyFailureKind(null)).toBe('permanent');
  });

  it('returns "permanent" for undefined', () => {
    expect(classifyFailureKind(undefined)).toBe('permanent');
  });

  it('returns "transient" for a subclass of TransientProcessingError', () => {
    class SubTransient extends TransientProcessingError {}
    expect(classifyFailureKind(new SubTransient('x'))).toBe('transient');
  });
});
