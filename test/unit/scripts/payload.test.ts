import { describe, it, expect } from 'vitest';
import { buildRecord } from '../../../scripts/producer/payload.mjs';
import { createIdPool } from '../../../scripts/producer/idPool.mjs';
import { getScenarioState } from '../../../scripts/producer/scenarios.mjs';

const VALID_LEVELS = ['debug', 'info', 'warn', 'error'];
const deterministicRng = () => 0.5;

function makePool() {
  return createIdPool({ users: 10, orders: 10, carts: 10, skus: 10 });
}

function baseline() {
  return getScenarioState('baseline', 0);
}

describe('buildRecord', () => {
  it('throws for an unknown service', () => {
    expect(() => buildRecord('unknown-service', baseline(), makePool(), deterministicRng)).toThrow(
      /No template/,
    );
  });

  it('returns a valid timestamp string', () => {
    const record = buildRecord('checkout-api', baseline(), makePool(), deterministicRng);
    expect(() => new Date(record.timestamp)).not.toThrow();
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns a valid level', () => {
    const record = buildRecord('checkout-api', baseline(), makePool(), deterministicRng);
    expect(VALID_LEVELS).toContain(record.level);
  });

  describe('checkout-api', () => {
    const record = buildRecord('checkout-api', baseline(), makePool(), deterministicRng);

    it('includes service name in meta', () => {
      expect(record.meta['service']).toBe('checkout-api');
    });

    it('includes http fields', () => {
      expect(record.meta).toHaveProperty('http.method', 'POST');
      expect(record.meta).toHaveProperty('http.route');
      expect(record.meta).toHaveProperty('http.status_code');
      expect(record.meta).toHaveProperty('http.response_time_ms');
    });

    it('includes user and cart and order ids', () => {
      expect(record.meta).toHaveProperty('user.id');
      expect(record.meta).toHaveProperty('cart.id');
      expect(record.meta).toHaveProperty('order.id');
    });

    it('has a non-empty message', () => {
      expect(typeof record.message).toBe('string');
      expect(record.message.length).toBeGreaterThan(0);
    });
  });

  describe('payment-service', () => {
    const record = buildRecord('payment-service', baseline(), makePool(), deterministicRng);

    it('includes payment fields', () => {
      expect(record.meta).toHaveProperty('payment.amount');
      expect(record.meta).toHaveProperty('payment.currency', 'USD');
      expect(record.meta).toHaveProperty('payment.outcome');
    });

    it('includes order.id', () => {
      expect(record.meta).toHaveProperty('order.id');
    });
  });

  describe('inventory-service', () => {
    const record = buildRecord('inventory-service', baseline(), makePool(), deterministicRng);

    it('includes sku and order fields', () => {
      expect(record.meta).toHaveProperty('sku');
      expect(record.meta).toHaveProperty('order.id');
    });

    it('includes db.duration_ms', () => {
      expect(record.meta).toHaveProperty('db.duration_ms');
    });
  });

  describe('auth-service', () => {
    const record = buildRecord('auth-service', baseline(), makePool(), deterministicRng);

    it('includes user.id and auth.outcome', () => {
      expect(record.meta).toHaveProperty('user.id');
      expect(record.meta).toHaveProperty('auth.outcome');
    });
  });

  describe('notification-service', () => {
    const record = buildRecord('notification-service', baseline(), makePool(), deterministicRng);

    it('includes user.id and order.id', () => {
      expect(record.meta).toHaveProperty('user.id');
      expect(record.meta).toHaveProperty('order.id');
    });

    it('includes notification.channel', () => {
      expect(record.meta).toHaveProperty('notification.channel');
    });
  });
});
