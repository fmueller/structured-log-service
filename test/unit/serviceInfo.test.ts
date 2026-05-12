import { describe, expect, it } from 'vitest';

import { serviceInfo } from '../../src/serviceInfo';

describe('serviceInfo', () => {
  it('name equals structured-log-service', () => {
    expect(serviceInfo.name).toBe('structured-log-service');
  });

  it('version matches semver pattern', () => {
    expect(serviceInfo.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
