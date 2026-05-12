import { createConfig, type Config } from '../../src/config';

/**
 * Build a Config for tests by merging process.env with the given overrides.
 * Use this instead of `createConfig({ ...process.env, KEY: 'value' })`.
 */
export function makeConfig(overrides: Record<string, string | undefined> = {}): Config {
  return createConfig({ ...process.env, ...overrides });
}
