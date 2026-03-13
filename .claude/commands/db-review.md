---
description: Review database schema, indexes, migrations, and query patterns
allowed-tools: Read, Grep
model: sonnet
---

You are a senior database architect and PostgreSQL expert. Review the database schema design, index strategy, query patterns, and migration readiness of this codebase.

---

## Step 1 — Read all entities and repositories

Read every entity and repository file:

- `api/order-service/src/entities/` (all files)
- `api/inventory-service/src/entities/` (all files)
- `libs/audit/src/audit-log.entity.ts`
- `api/order-service/src/repositories/` (all files)
- `api/inventory-service/src/repositories/` (all files)

Also read AppModule files to understand TypeORM configuration:
- `api/order-service/src/app/app.module.ts`
- `api/inventory-service/src/app/app.module.ts`

---

## Step 2 — Schema Design Review

### Normalization & Data Integrity
- Are foreign keys defined (`@ManyToOne`, `@JoinColumn`) where relationships exist?
- Are nullable columns correctly marked `nullable: true`?
- Are NOT NULL constraints on required columns?
- Are UNIQUE constraints enforced (`@Unique`, `@Column({ unique: true })`)?
- Is `@VersionColumn` used correctly for optimistic locking on entities with concurrent writes?

### Data Types
- Are UUIDs used as PKs consistently? (`@PrimaryGeneratedColumn('uuid')`)
- Are monetary amounts stored as `decimal(10,2)` not `float` or `double`? (float precision risk)
- Are enums stored as `varchar` with TypeScript enum type? Or PostgreSQL native enum?
- Are timestamps in UTC with timezone awareness?
- Is JSONB used for semi-structured data (order `items`)? Are GIN indexes needed?

### Table Naming
- Are table names explicit (`@Entity('orders')`) rather than relying on TypeORM defaults?
- Are column names in snake_case to match PostgreSQL conventions?

---

## Step 3 — Index Analysis

For each entity, map all queries in repositories to existing indexes:

| Query | Columns Filtered | Index Exists? | Recommendation |
|-------|-----------------|---------------|----------------|
| `findByUser(userId)` | `orders.user_id` | ? | `@Index(['userId'])` |
| `listOrders(status)` | `orders.status` | ? | `@Index(['status'])` |
| `findBySku(sku)` | `inventory.sku` | UNIQUE ✓ | — |
| `findUnsent()` | `*_outbox.status` | ? | `@Index(['status'])` |
| Audit: findByUser | `audit_logs.(userId, createdAt)` | ? | Composite index |
| Audit: findByEntity | `audit_logs.(entityType, entityId)` | ? | Composite index |
| Audit: findByTrace | `audit_logs.traceId` | ? | Single index |

For each missing index, provide the TypeORM decorator to add.

---

## Step 4 — Query Pattern Review

### Pagination
- Are all list queries using `LIMIT`/`OFFSET` or `take`/`skip`?
- Is `OFFSET` pagination acceptable for current data volumes? (OFFSET is slow at scale — consider cursor-based for large tables)
- Is `total` count computed with `COUNT(*)` in the same query or a separate call?

### Locking
- Is `FOR UPDATE SKIP LOCKED` used correctly in outbox pollers?
- Are there any `FOR UPDATE` without `SKIP LOCKED` that could cause contention under scale?
- Is optimistic lock conflict (`OptimisticLockVersionMismatchError`) handled with retry or 409 response?

### Raw Queries
- Are any `query()` or `createQueryBuilder()` calls using raw string interpolation?
- Are all user inputs bound via `.setParameter()` or equivalent?

### Soft Deletes
- Are any entities soft-deleted (`@DeleteDateColumn`)? If so, are all queries filtering `deleted_at IS NULL`?

---

## Step 5 — Migration Readiness

- Is `synchronize: true` correctly gated by `NODE_ENV !== 'production'`?
- Are TypeORM migrations set up? Check for a `migrations/` folder in each service.
- If migrations don't exist yet, list the SQL to generate the initial migration:
  ```bash
  pnpm typeorm migration:generate -n InitialSchema -d src/data-source.ts
  ```
- Are there any destructive schema changes (column drops, renames) in the entity definitions that would lose data without a migration?

---

## Step 6 — `audit_logs` Table Growth

- Is there a data retention strategy? (rows will grow unboundedly)
- Should old audit logs be archived to cold storage or partitioned by month?
- Is the table size likely to cause index degradation over time?
- Recommendation: add a `@Index(['createdAt'])` and partition or archive rows older than 90 days.

---

## Output

### Schema Issues
| # | Entity | Issue | Severity | Fix |
|---|--------|-------|----------|-----|

### Missing Indexes
```typescript
// Add to <Entity>:
@Index(['columnName'])
```

### Query Improvements
List specific repository methods with more efficient alternatives.

### Migration Action Items
Ordered list of what must be done before production deployment.
