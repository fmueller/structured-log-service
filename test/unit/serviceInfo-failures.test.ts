import { describe, expect, it } from 'vitest';

import { loadServiceInfo } from '../../src/serviceInfo';

describe('loadServiceInfo', () => {
  it('throws when version field is missing', () => {
    const read = () => JSON.stringify({ name: 'x' });
    expect(() => loadServiceInfo(read)).toThrow(/Invalid package\.json.*version/);
  });

  it('throws when version does not match semver pattern', () => {
    const read = () => JSON.stringify({ name: 'x', version: 'not-a-version' });
    expect(() => loadServiceInfo(read)).toThrow(/Invalid package\.json.*version/);
  });
});
