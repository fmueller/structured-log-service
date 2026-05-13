// Builds realistic log records for each e-commerce service.

import { weightedLevelPicker } from './levels.mjs';

const STATUS_BY_LEVEL = {
  debug: [200],
  info: [200, 200, 200, 204],
  warn: [400, 400, 404, 429],
  error: [500, 500, 503, 504],
};

function pickStatus(level, rng) {
  const options = STATUS_BY_LEVEL[level] ?? [200];
  return options[Math.floor(rng() * options.length)];
}

function responseTimeMs(baseMs, latencyMultiplier, rng) {
  const jitter = 0.8 + rng() * 0.4; // ±20%
  return Math.round(baseMs * latencyMultiplier * jitter);
}

function effectiveWeights(scenarioState, serviceName) {
  const mod = scenarioState.perServiceModifiers?.get(serviceName);
  return mod?.levelWeights ?? scenarioState.levelWeights;
}

function effectiveLatency(scenarioState, serviceName) {
  const mod = scenarioState.perServiceModifiers?.get(serviceName);
  const serviceMultiplier = mod?.latencyMultiplier ?? 1.0;
  return scenarioState.latencyMultiplier * serviceMultiplier;
}

const PAYMENT_OUTCOMES = ['charged', 'charged', 'charged', 'declined'];
const DECLINE_REASONS = ['insufficient_funds', 'card_expired', 'fraud_blocked'];
const NOTIFICATION_CHANNELS = ['email', 'email', 'sms'];

function buildCheckoutApi(level, idPool, latencyMult, rng) {
  const cartId = idPool.cartId();
  const userId = idPool.userId();
  const orderId = idPool.orderId();
  const status = pickStatus(level, rng);
  const ms = responseTimeMs(80, latencyMult, rng);
  return {
    message: `POST /checkout/${cartId} ${String(status)} in ${String(ms)}ms for user ${userId}`,
    meta: {
      service: 'checkout-api',
      'http.method': 'POST',
      'http.route': '/checkout/:cartId',
      'http.status_code': status,
      'http.response_time_ms': ms,
      'user.id': userId,
      'cart.id': cartId,
      'order.id': orderId,
    },
  };
}

function buildPaymentService(level, idPool, latencyMult, rng) {
  const orderId = idPool.orderId();
  const status = pickStatus(level, rng);
  const ms = responseTimeMs(120, latencyMult, rng);
  const outcome =
    level === 'error' ? 'declined' : PAYMENT_OUTCOMES[Math.floor(rng() * PAYMENT_OUTCOMES.length)];
  const amount = (Math.floor(rng() * 9900) + 100) / 100;
  const meta = {
    service: 'payment-service',
    'http.method': 'POST',
    'http.route': '/charges',
    'http.status_code': status,
    'http.response_time_ms': ms,
    'order.id': orderId,
    'payment.amount': amount,
    'payment.currency': 'USD',
    'payment.outcome': outcome,
  };
  if (outcome === 'declined') {
    meta['payment.decline_reason'] = DECLINE_REASONS[Math.floor(rng() * DECLINE_REASONS.length)];
  }
  return {
    message:
      outcome === 'declined'
        ? `POST /charges declined for order ${orderId}`
        : `POST /charges charged ${String(amount)} USD for order ${orderId}`,
    meta,
  };
}

function buildInventoryService(level, idPool, latencyMult, rng) {
  const sku = idPool.sku();
  const orderId = idPool.orderId();
  const status = pickStatus(level, rng);
  const ms = responseTimeMs(40, latencyMult, rng);
  const qty = Math.floor(rng() * 5) + 1;
  return {
    message: `reserved sku ${sku} qty ${String(qty)} for order ${orderId}`,
    meta: {
      service: 'inventory-service',
      'http.method': 'PUT',
      'http.route': '/reserve',
      'http.status_code': status,
      'http.response_time_ms': ms,
      sku,
      'order.id': orderId,
      'db.duration_ms': Math.round(ms * 0.6),
    },
  };
}

function buildAuthService(level, idPool, latencyMult, rng) {
  const userId = idPool.userId();
  const status = pickStatus(level, rng);
  const ms = responseTimeMs(30, latencyMult, rng);
  const outcome = level === 'error' ? 'failed' : 'ok';
  return {
    message:
      outcome === 'failed'
        ? `POST /token auth failed for user ${userId}`
        : `POST /token issued token for user ${userId}`,
    meta: {
      service: 'auth-service',
      'http.method': 'POST',
      'http.route': '/token',
      'http.status_code': status,
      'http.response_time_ms': ms,
      'user.id': userId,
      'auth.outcome': outcome,
    },
  };
}

function buildNotificationService(level, idPool, latencyMult, rng) {
  const userId = idPool.userId();
  const orderId = idPool.orderId();
  const status = pickStatus(level, rng);
  const ms = responseTimeMs(20, latencyMult, rng);
  const channel = NOTIFICATION_CHANNELS[Math.floor(rng() * NOTIFICATION_CHANNELS.length)];
  return {
    message: `POST /notify sent ${channel} to user ${userId} for order ${orderId}`,
    meta: {
      service: 'notification-service',
      'http.method': 'POST',
      'http.route': '/notify',
      'http.status_code': status,
      'http.response_time_ms': ms,
      'user.id': userId,
      'order.id': orderId,
      'notification.channel': channel,
    },
  };
}

const SERVICE_BUILDERS = {
  'checkout-api': buildCheckoutApi,
  'payment-service': buildPaymentService,
  'inventory-service': buildInventoryService,
  'auth-service': buildAuthService,
  'notification-service': buildNotificationService,
};

/**
 * Builds one log record for the given service under the current scenario.
 *
 * @param {string} serviceName
 * @param {object} scenarioState
 * @param {object} idPool
 * @param {() => number} rng
 */
export function buildRecord(serviceName, scenarioState, idPool, rng) {
  const weights = effectiveWeights(scenarioState, serviceName);
  const latencyMult = effectiveLatency(scenarioState, serviceName);
  const pickLevel = weightedLevelPicker(weights, rng);
  const level = pickLevel();

  const builder = SERVICE_BUILDERS[serviceName];
  if (!builder) {
    throw new Error(`No template for service "${serviceName}"`);
  }

  const { message, meta } = builder(level, idPool, latencyMult, rng);

  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
  };
}
