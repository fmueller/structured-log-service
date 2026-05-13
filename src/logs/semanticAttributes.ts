export const SEMANTIC_ATTRIBUTE_KEYS = [
  'http.method',
  'http.route',
  'http.status_code',
  'http.response_time_ms',
  'user.id',
  'order.id',
  'cart.id',
  'sku',
  'payment.amount',
  'payment.currency',
  'payment.outcome',
  'auth.outcome',
  'notification.channel',
  'db.duration_ms',
] as const;

export type SemanticAttributeKey = (typeof SEMANTIC_ATTRIBUTE_KEYS)[number] | 'log.service';

export type PromotedAttributes = Partial<Record<SemanticAttributeKey, unknown>>;

export type PromotionResult = {
  promoted: PromotedAttributes;
  rest: Record<string, unknown>;
};

export function promoteSemanticAttributes(meta: Record<string, unknown>): PromotionResult {
  const promoted: PromotedAttributes = {};
  const rest: Record<string, unknown> = {};

  for (const key of SEMANTIC_ATTRIBUTE_KEYS) {
    if (key in meta && meta[key] !== undefined) {
      promoted[key] = meta[key];
    }
  }

  // Alias: meta.service → log.service (meta['log.service'] takes precedence if both present)
  const logService = meta['log.service'] !== undefined ? meta['log.service'] : meta['service'];
  if (logService !== undefined) {
    promoted['log.service'] = logService;
  }

  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    const isPromoted = (SEMANTIC_ATTRIBUTE_KEYS as readonly string[]).includes(key);
    const isAlias = key === 'service' || key === 'log.service';
    if (!isPromoted && !isAlias) {
      rest[key] = value;
    }
  }

  return { promoted, rest };
}
