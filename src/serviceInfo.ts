import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

// Unanchored at end: allows valid semver pre-release/build suffixes (e.g. 1.2.3-alpha.1, 1.2.3+sha.abc)
const packageSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
});

type ServiceInfo = z.infer<typeof packageSchema>;

export function loadServiceInfo(
  read: () => string = () => readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
): ServiceInfo {
  const result = packageSchema.safeParse(JSON.parse(read()));
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid package.json: missing or invalid field(s): ${missing}`);
  }
  return result.data;
}

export const serviceInfo: ServiceInfo = loadServiceInfo();
