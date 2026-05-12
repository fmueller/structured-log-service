import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, ApiKeyStore } from '../../src/auth/apiKeyStore';
import { type AuthenticatedRequest, createAuthMiddleware } from '../../src/auth/authMiddleware';

describe('createAuthMiddleware', () => {
  function makeReq(headers: Record<string, string>): AuthenticatedRequest {
    const normalised = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      headers: normalised,
      header(name: string) {
        return normalised[name.toLowerCase()];
      },
    } as unknown as AuthenticatedRequest;
  }

  function makeRes() {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
    };
    return res;
  }

  function makeStore(map: Record<string, ApiClient>): ApiKeyStore {
    return {
      findByToken: vi.fn(async (token: string) => map[token] ?? null),
    };
  }

  it('missing header → 401 missing_authorization_header', async () => {
    const store = makeStore({});
    const middleware = createAuthMiddleware(store);
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'missing_authorization_header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('non-Bearer scheme ("Basic xyz") → 401 invalid_authorization_header', async () => {
    const store = makeStore({});
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'Basic xyz' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_authorization_header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('lowercase "bearer" scheme accepted — valid token calls next', async () => {
    const store = makeStore({ 'good-token': { id: 'client-1', name: 'Client 1' } });
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'bearer good-token' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.client?.id).toBe('client-1');
  });

  it('multi-space separator ("Bearer   token") accepted — next called and req.client populated', async () => {
    const store = makeStore({ 'good-token': { id: 'client-1', name: 'Client 1' } });
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'Bearer   good-token' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.client?.id).toBe('client-1');
  });

  it('empty token after scheme ("Bearer ") → 401 invalid_authorization_header', async () => {
    const store = makeStore({});
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'Bearer ' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_authorization_header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('unknown token → 401 invalid_api_key', async () => {
    const store = makeStore({});
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'Bearer unknown-token' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_api_key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('valid token → next() called and req.client populated', async () => {
    const store = makeStore({ 'good-token': { id: 'client-1', name: 'Client 1' } });
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'Bearer good-token' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.client?.id).toBe('client-1');
  });

  it('three-part header ("Bearer tok en") → 401 invalid_authorization_header', async () => {
    const store = makeStore({});
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'Bearer tok en' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_authorization_header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards store errors to next(err)', async () => {
    const storeError = new Error('store down');
    const store: ApiKeyStore = {
      findByToken: vi.fn().mockRejectedValue(storeError),
    };
    const middleware = createAuthMiddleware(store);
    const req = makeReq({ authorization: 'Bearer some-token' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(storeError);
    expect(res.statusCode).toBe(0);
  });
});
