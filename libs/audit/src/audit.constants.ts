/**
 * DI injection token for AuditModuleOptions.
 * Kept in its own file to avoid circular imports between
 * audit.module.ts ↔ audit.service.ts.
 */
export const AUDIT_MODULE_OPTIONS = 'AUDIT_MODULE_OPTIONS';
