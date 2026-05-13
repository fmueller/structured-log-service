import { describe, expect, it } from 'vitest';

import { TransientProcessingError } from '../../src/logs/transientProcessingError';

describe('TransientProcessingError', () => {
  it('is an instance of Error', () => {
    const err = new TransientProcessingError('something went wrong');

    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of TransientProcessingError', () => {
    const err = new TransientProcessingError('something went wrong');

    expect(err).toBeInstanceOf(TransientProcessingError);
  });

  it('has name === "TransientProcessingError"', () => {
    const err = new TransientProcessingError('something went wrong');

    expect(err.name).toBe('TransientProcessingError');
  });

  it('round-trips the message passed to the constructor', () => {
    const message = 'Simulated log processing failure';
    const err = new TransientProcessingError(message);

    expect(err.message).toBe(message);
  });

  it('exposes the cause when passed via options', () => {
    const cause = new Error('root cause');
    const err = new TransientProcessingError('wrapper', { cause });

    expect(err.cause).toBe(cause);
  });
});
