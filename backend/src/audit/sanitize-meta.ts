/** Llaves que nunca deben llegar a audit_logs (regla 4). */
const SENSITIVE_KEY = /(secret|password|token|key)/i;

/** Copia profunda de `value` sin las llaves sensibles. */
export function sanitizeMeta(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMeta);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, nested]) => [key, sanitizeMeta(nested)]),
    );
  }
  return value;
}
