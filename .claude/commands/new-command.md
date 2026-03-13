---
description: Scaffold a new CQRS Command + Handler + DTO for a service
argument-hint: [service: order|inventory] [CommandName] [description]
allowed-tools: Read, Write, Edit, Bash(git:*)
model: sonnet
---

You are a senior NestJS architect. Scaffold a complete, production-ready CQRS Command + Handler + DTO for the `$1-service`.

**Command name:** `$2`
**Description:** $3

---

## Step 1 — Understand the target service

Read the existing AppModule and one existing command handler to understand the patterns in use:

- `api/$1-service/src/app/app.module.ts`
- `api/$1-service/src/commands/` (read all files)
- `api/$1-service/src/repositories/` (read all files)
- `api/$1-service/src/entities/` (read all entities)
- `api/$1-service/src/app/app.controller.ts`

## Step 2 — Generate all files

Create the following files following the **exact patterns** found in the service:

### 2a. Command class
File: `api/$1-service/src/commands/$2.command.ts`

```typescript
// Plain class — NO decorators
export class $2Command {
  constructor(
    // ... typed constructor params
  ) {}
}
```

### 2b. Command Handler
File: `api/$1-service/src/commands/handlers/$2.handler.ts`

Requirements:
- `@CommandHandler($2Command)` + `implements ICommandHandler<$2Command>`
- Inject `DataSource` for transaction management
- Inject `AppLogger` for structured logging
- Use `dataSource.transaction(async (em) => { ... })` for all DB writes
- If this command publishes a Kafka event: atomically write the domain record AND the outbox row in the same transaction
- Call `AppLogger.logOperationStart` at start and `logOperationSuccess`/`logOperationError` appropriately
- Throw `NotFoundException`, `ConflictException`, or `BadRequestException` as appropriate
- Never expose raw DB errors to callers

### 2c. DTO
File: `api/$1-service/src/dto/$2.dto.ts`

Requirements:
- All fields annotated with `class-validator` decorators
- `@IsOptional()` only on truly optional fields
- `@IsUUID()` for any UUID fields
- `@IsEnum()` for enum fields
- `@Min(1)` / `@Max()` for numeric bounds
- No `any` types

### 2d. Controller route
Add a new route to `api/$1-service/src/app/app.controller.ts`:
- Thin dispatcher only
- `@Body()` or `@Param()` + `@Body()` as appropriate
- Return correct HTTP status code (201 for create, 202 for async, 200 for sync)
- `commandBus.execute(new $2Command(...))` — nothing else

### 2e. AppModule registration
Add `$2Handler` to the providers array in `api/$1-service/src/app/app.module.ts`.

## Step 3 — Write unit tests

File: `api/$1-service/src/commands/handlers/$2.handler.spec.ts`

Requirements:
- Test: happy path (command executes successfully)
- Test: not found case (if applicable)
- Test: conflict case (if applicable)
- Test: transaction rollback on error
- Mock `DataSource`, `EntityManager`, `AppLogger`
- Do NOT test implementation details — test observable outcomes

## Step 4 — Verify

After creating all files:
1. Check that the handler is registered in AppModule
2. Check that the DTO has complete validation
3. Confirm outbox write is in the same transaction as domain write (if applicable)
4. List the files created and their paths

Never add `@Injectable()`, `@Inject()` to the Command class itself.
Never add business logic to the controller.
Never write to the outbox outside of a transaction.
