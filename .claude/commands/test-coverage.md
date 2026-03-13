---
description: Run tests, analyze coverage gaps, generate missing test stubs
argument-hint: [service: order|inventory|api-gateway|all]
allowed-tools: Read, Bash(pnpm:*), Bash(git:*)
model: sonnet
---

You are a senior engineer responsible for test quality. Analyze and improve test coverage for `$ARGUMENTS`.

---

## Step 1 — Run tests with coverage

${ $ARGUMENTS === 'all'
  ? 'Run tests for all services:'
  : `Run tests for $ARGUMENTS:`
}

!`pnpm nx test $ARGUMENTS --coverage --passWithNoTests 2>&1 | tail -60`

If `$ARGUMENTS` is `all`:
!`pnpm nx run-many -t test --coverage 2>&1 | tail -80`

---

## Step 2 — Read the source files for gap analysis

Read all source files in the tested service(s) to understand what logic exists and what tests are present:

For `$ARGUMENTS-service` (or each service if `all`):
- `api/$ARGUMENTS-service/src/commands/handlers/` (all handler files)
- `api/$ARGUMENTS-service/src/queries/handlers/` (all handler files)
- `api/$ARGUMENTS-service/src/consumers/` (all consumer files)
- `api/$ARGUMENTS-service/src/repositories/` (all repository files)
- `api/$ARGUMENTS-service/src/outbox/` (outbox poller)
- Any existing `*.spec.ts` files

---

## Step 3 — Analyze coverage gaps

Identify untested or under-tested scenarios:

### Command Handlers
For each command handler, verify these test cases exist:
- [ ] Happy path — command executes, DB writes committed
- [ ] Not found — throws `NotFoundException` (if applicable)
- [ ] Conflict — throws `ConflictException` for duplicate (if applicable)
- [ ] Validation — invalid input rejected at DTO level
- [ ] Transaction rollback — if DB fails, domain record is NOT written (and vice versa for outbox)
- [ ] Outbox write — outbox row created in same transaction as domain record

### Query Handlers
- [ ] Returns correct data shape
- [ ] Paginated result includes `total` count
- [ ] Empty result returns `{ data: [], total: 0 }` not null/undefined
- [ ] Not found throws `NotFoundException` (for single-entity queries)

### Kafka Consumers
- [ ] Happy path — event processed, inbox marked PROCESSED
- [ ] Duplicate event — `tryInsert` returns false → early return, no domain change
- [ ] Missing `event-id` header — handled without crash
- [ ] Domain exception — inbox marked FAILED, error logged

### Outbox Poller
- [ ] Publishes UNSENT rows to Kafka
- [ ] Marks rows SENT on success
- [ ] Increments retryCount on failure
- [ ] Marks FAILED after 5 attempts

### Repositories
- [ ] `tryInsert` returns false on UNIQUE violation
- [ ] `findUnsentLocked` uses pessimistic locking

---

## Step 4 — Generate missing test stubs

For every gap identified, generate a complete test stub with:
- Correct mocking of `DataSource`, `EntityManager`, repositories, `AppLogger`
- Descriptive `describe` / `it` blocks
- Arrange-Act-Assert structure
- Assertions on observable outcomes (not implementation details)

Follow the exact pattern of existing spec files in the service. Use `jest.fn()` for mocks.

Example stub pattern:
```typescript
describe('XyzHandler', () => {
  let handler: XyzHandler;
  let dataSource: jest.Mocked<DataSource>;
  let logger: jest.Mocked<AppLogger>;

  beforeEach(() => {
    dataSource = { transaction: jest.fn() } as any;
    logger = {
      logOperationStart: jest.fn(),
      logOperationSuccess: jest.fn(),
      logOperationError: jest.fn(),
    } as any;
    handler = new XyzHandler(dataSource, logger);
  });

  it('should ...', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

---

## Step 5 — Coverage summary

Report:
- Current coverage % per file (from the coverage output)
- Files below 80% threshold
- Critical untested paths (business logic, error branches)
- Files to prioritize for test addition

The 80% threshold is enforced in `jest.config.cts` — any new test file must meet it.
