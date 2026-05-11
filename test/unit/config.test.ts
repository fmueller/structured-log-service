import { describe, expect, it } from 'vitest';

import { createConfig, parsePort } from '../../src/config';

describe('parsePort', () => {
  it('uses the default port when the value is missing', () => {
    expect(parsePort(undefined)).toBe(3003);
  });

  it('parses a configured port', () => {
    expect(parsePort('4321')).toBe(4321);
  });

  it('rejects an invalid port', () => {
    expect(() => parsePort('abc')).toThrow('PORT must be a positive integer');
  });

  it('rejects an empty port value', () => {
    expect(() => parsePort('')).toThrow('PORT must be a positive integer');
  });

  it('rejects zero as a port value', () => {
    expect(() => parsePort('0')).toThrow('PORT must be a positive integer');
  });
});

describe('createConfig', () => {
  it('uses the default port when PORT is not set', () => {
    expect(createConfig({})).toEqual({ port: 3003 });
  });

  it('passes the parsed env value through parsePort', () => {
    expect(createConfig({ PORT: '4321' })).toEqual({ port: 4321 });
  });
});
