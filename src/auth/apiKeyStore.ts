import type { ApiKeyClient as ApiClient } from '../config';

export type { ApiKeyClient as ApiClient } from '../config';

export interface ApiKeyStore {
  findByToken(token: string): Promise<ApiClient | null>;
}

export class InMemoryApiKeyStore implements ApiKeyStore {
  constructor(private readonly keys: Map<string, ApiClient>) {}

  async findByToken(token: string): Promise<ApiClient | null> {
    return this.keys.get(token) ?? null;
  }
}
