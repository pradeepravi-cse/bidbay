/**
 * CQRS — QUERY
 * ────────────
 * A Query carries READ intent only. Its handler MUST NEVER modify state.
 * This is the read-side of CQRS.
 *
 * In a more advanced system, queries would hit a dedicated read-replica or a
 * denormalized read model (e.g., a materialised view or a Redis cache).
 * For now they hit the same PostgreSQL instance.
 */
export class GetOrderByIdQuery {
  constructor(public readonly orderId: string) {}
}
