// ─── Enums ───────────────────────────────────────────────────────────────────

export enum AuditLevel {
  /** Captured at the HTTP transport layer (request/response). */
  HTTP = 'HTTP',
  /** Captured when a domain entity is mutated in the database. */
  ENTITY = 'ENTITY',
}

export enum AuditAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  QUERY = 'QUERY',
}

export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  ERROR = 'ERROR',
}

// ─── Data shapes passed to AuditService ──────────────────────────────────────

export interface HttpAuditData {
  traceId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  httpMethod: string;
  httpPath: string;
  httpStatusCode: number;
  requestBody?: Record<string, unknown>;
  requestQuery?: Record<string, unknown>;
  durationMs: number;
  outcome: AuditOutcome;
  errorMessage?: string;
}

export interface EntityAuditData {
  traceId?: string;
  userId?: string;
  entityType: string;
  entityId?: string;
  action: AuditAction;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  diff?: Record<string, unknown>;
  outcome?: AuditOutcome;
  errorMessage?: string;
}

// ─── Module options ───────────────────────────────────────────────────────────

export interface AuditModuleOptions {
  /** Human-readable service name embedded in every audit record. */
  serviceName: string;
  /**
   * When true (default), audit entries are persisted to the `audit_logs` table.
   * Set to false for services that have no database (e.g. the API gateway)
   * — entries will still be emitted as structured log lines.
   */
  persistToDb?: boolean;
  /** Field names whose values are masked with [REDACTED] before storage. */
  sensitiveFields?: string[];
  /** URL path prefixes that should not generate HTTP audit entries. */
  excludedPaths?: string[];
  /** Entity type names (TypeORM metadata name) to skip entity-level auditing. */
  excludedEntities?: string[];
}
