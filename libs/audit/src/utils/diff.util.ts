/**
 * Computes a field-level diff between two plain objects.
 *
 * Only fields that changed are included. The comparison uses JSON serialisation
 * so nested objects and arrays are compared by value, not reference.
 *
 * @returns An object keyed by changed field name.
 *          Each value is `{ before, after }`.
 */
export function computeDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Record<string, { before: unknown; after: unknown }> {
  if (!before && !after) return {};

  const safeB = before ?? {};
  const safeA = after ?? {};
  const allKeys = new Set([...Object.keys(safeB), ...Object.keys(safeA)]);

  const diff: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of allKeys) {
    const bVal = safeB[key];
    const aVal = safeA[key];
    // Use JSON comparison for deep equality (handles dates serialised as strings too)
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      diff[key] = { before: bVal, after: aVal };
    }
  }

  return diff;
}
