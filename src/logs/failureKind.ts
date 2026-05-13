import { TransientProcessingError } from './transientProcessingError';

export type FailureKind = 'none' | 'transient' | 'permanent';

export function classifyFailureKind(error: unknown): 'transient' | 'permanent' {
  return error instanceof TransientProcessingError ? 'transient' : 'permanent';
}
