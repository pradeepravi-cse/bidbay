/**
 * Default list of field names considered sensitive.
 * Matching is case-insensitive and applied recursively to nested objects.
 */
const DEFAULT_SENSITIVE_FIELDS: ReadonlyArray<string> = [
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'apikey',
  'api_key',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'ssn',
  'pin',
  'privatekey',
  'private_key',
];

/**
 * Deep-clones `obj` replacing any sensitive field values with `[REDACTED]`.
 * Safe to call with null / undefined — returns undefined in those cases.
 */
export function sanitize(
  obj: Record<string, unknown> | null | undefined,
  extraSensitiveFields: string[] = [],
): Record<string, unknown> | undefined {
  if (obj == null || typeof obj !== 'object') return undefined;

  const masked = new Set<string>([
    ...DEFAULT_SENSITIVE_FIELDS,
    ...extraSensitiveFields.map((f) => f.toLowerCase()),
  ]);

  return redact(obj, masked) as Record<string, unknown>;
}

function redact(value: unknown, masked: Set<string>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, masked));

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = masked.has(key.toLowerCase()) ? '[REDACTED]' : redact(val, masked);
  }
  return result;
}
