---
description: Scaffold a new CQRS Query + Handler + DTO for a service
argument-hint: [service: order|inventory] [QueryName] [description]
allowed-tools: Read, Write, Edit, Bash(git:*)
model: sonnet
---

You are a senior NestJS architect. Scaffold a complete, production-ready CQRS Query + Handler for the `$1-service`.

**Query name:** `$2`
**Description:** $3

---

## Step 1 — Understand the target service

Read the existing AppModule and one existing query handler:

- `api/$1-service/src/app/app.module.ts`
- `api/$1-service/src/queries/` (read all files)
- `api/$1-service/src/repositories/` (read all files)
- `api/$1-service/src/entities/` (read all entities)
- `api/$1-service/src/app/app.controller.ts`

## Step 2 — Generate all files

### 2a. Query class
File: `api/$1-service/src/queries/$2.query.ts`

```typescript
// Plain class — NO decorators
export class $2Query {
  constructor(
    // ... typed constructor params
  ) {}
}
```

### 2b. Query Handler
File: `api/$1-service/src/queries/handlers/$2.handler.ts`

Requirements:
- `@QueryHandler($2Query)` + `implements IQueryHandler<$2Query>`
- Inject the relevant Repository, NOT DataSource (reads don't need transactions)
- Inject `AppLogger`
- Return typed result — define a response interface if the shape is non-trivial
- Use `logOperationStart` / `logOperationSuccess` / `logOperationError`
- Throw `NotFoundException` if single-entity lookup returns null
- Paginated list queries: always return `{ data: T[], total: number }`
- Never expose raw DB errors

### 2c. Query DTO (if query has parameters)
File: `api/$1-service/src/dto/$2.dto.ts`

Requirements:
- `@IsOptional()` for filter/pagination params
- `@Type(() => Number)` + `@IsInt()` + `@Min(1)` for page/limit
- `@Max(50)` on limit to prevent unbounded queries
- `@IsEnum()` for status filters

### 2d. Controller route
Add a GET route to `api/$1-service/src/app/app.controller.ts`:
- `@Query()` for filter/pagination params
- `@Param()` for path params
- Returns 200
- Thin: `queryBus.execute(new $2Query(...))` only

### 2e. AppModule registration
Add `$2Handler` to providers in `api/$1-service/src/app/app.module.ts`.

## Step 3 — Write unit tests

File: `api/$1-service/src/queries/handlers/$2.handler.spec.ts`

Requirements:
- Test: returns correct shape for valid input
- Test: returns paginated result with total (if list query)
- Test: throws NotFoundException for missing single entity
- Mock the repository with jest.fn()
- Assert on return value shape, not implementation details

## Step 4 — Verify

List all files created. Confirm:
- Handler is in AppModule providers
- Pagination limit is bounded
- No transaction used (read-only)
