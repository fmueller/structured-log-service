/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  checkers: ['typescript'],
  plugins: ['@stryker-mutator/typescript-checker', '@stryker-mutator/vitest-runner'],
  coverageAnalysis: 'off',
  mutate: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/telemetry/**',
    '!src/logs/logRoutes.ts',
    '!src/logs/logProcessor.ts',
    '!src/logs/logWorker.ts',
  ],
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
