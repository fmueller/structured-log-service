import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().optional(),
});

const positiveIntegerPattern = /^(?:[1-9]\d*)$/;

export function parsePort(rawPort: string | undefined): number {
  const value = rawPort ?? '3003';

  if (!positiveIntegerPattern.test(value)) {
    throw new Error('PORT must be a positive integer');
  }

  return Number(value);
}

export function createConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);

  return {
    port: parsePort(parsed.PORT),
  };
}

export const config = createConfig();
