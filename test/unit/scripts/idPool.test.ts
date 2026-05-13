import { describe, it, expect } from 'vitest';
import { createIdPool } from '../../../scripts/producer/idPool.mjs';

describe('createIdPool', () => {
  it('generates userId with u- prefix', () => {
    const pool = createIdPool({ users: 5, orders: 5, carts: 5, skus: 5 });
    expect(pool.userId()).toMatch(/^u-\d+$/);
  });

  it('generates orderId with ord- prefix', () => {
    const pool = createIdPool({ users: 5, orders: 5, carts: 5, skus: 5 });
    expect(pool.orderId()).toMatch(/^ord-\d+$/);
  });

  it('generates cartId with cart- prefix', () => {
    const pool = createIdPool({ users: 5, orders: 5, carts: 5, skus: 5 });
    expect(pool.cartId()).toMatch(/^cart-\d+$/);
  });

  it('generates sku with sku- prefix', () => {
    const pool = createIdPool({ users: 5, orders: 5, carts: 5, skus: 5 });
    expect(pool.sku()).toMatch(/^sku-\d+$/);
  });

  it('cycles through users and wraps around', () => {
    const pool = createIdPool({ users: 3, orders: 3, carts: 3, skus: 3 });
    const first = pool.userId();
    pool.userId();
    pool.userId();
    const fourth = pool.userId(); // should wrap
    expect(fourth).toBe(first);
  });

  it('cycles independently for different ID types', () => {
    const pool = createIdPool({ users: 2, orders: 3, carts: 2, skus: 2 });
    const u1 = pool.userId();
    const o1 = pool.orderId();
    pool.userId(); // consume second user slot
    const o2 = pool.orderId();
    // Users wrap after 2, orders after 3
    const u3 = pool.userId(); // wraps back to u1
    expect(u3).toBe(u1);
    expect(o2).not.toBe(o1); // hasn't wrapped yet
  });

  it('produces distinct IDs within pool size', () => {
    const pool = createIdPool({ users: 5, orders: 5, carts: 5, skus: 5 });
    const ids = Array.from({ length: 5 }, () => pool.userId());
    const unique = new Set(ids);
    expect(unique.size).toBe(5);
  });
});
