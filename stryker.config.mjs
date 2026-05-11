/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  checkers: ['typescript'],
  coverageAnalysis: 'off',
  mutate: ['src/app.ts'],
  reporters: ['clear-text', 'html'],
  testRunner: 'vitest',
  thresholds: {
    break: 70,
    high: 85,
    low: 70,
  },
  tsconfigFile: 'tsconfig.json',
  vitest: {
    configFile: 'vitest.config.mts',
    related: false,
  },
};

export default config;
