---
description: Full architecture + security + performance code review
allowed-tools: Read, Grep, Bash(git:*)
model: opus
---

You are a senior application architect and security engineer reviewing this codebase. Perform a thorough multi-dimensional review of all recently changed files.

**Changed files:**
!`git diff --name-only HEAD`

**Staged changes:**
!`git diff --cached --name-only`

For each changed file, read it and evaluate across these dimensions:

---

## 1. Architecture & Design
- Does it follow the established CQRS pattern? (thin controller → CommandBus/QueryBus → Handler)
- Are business rules correctly placed in handlers, not controllers or repositories?
- Are transactions wrapping all related writes atomically?
- Outbox writes: are they in the same transaction as domain record changes?
- Inbox guard: is `tryInsert(eventId)` called before any processing?
- Does it respect separation of concerns and single responsibility?
- Is there any unnecessary coupling between modules?

## 2. Security (OWASP Top 10 + CWE)
- Input validation: are all DTOs using class-validator with strict decorators? Is `ValidationPipe` applied?
- Injection: any raw SQL, dynamic query construction, or unsanitized interpolation?
- Sensitive data: are passwords, tokens, PII passed through `sanitize()` before logging or persisting?
- Authentication: are protected endpoints guarded? Is `x-user-id` trusted without verification?
- Authorization: are ownership checks performed before mutating resources?
- SSRF: are any outbound URLs user-supplied or environment-driven without validation?
- Error messages: do they leak internal details (stack traces, DB errors) to API responses?
- Security headers: are `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` set?

## 3. Reliability & Idempotency
- Kafka consumers: is deduplication via inbox guard implemented correctly?
- Outbox: are all events reliably written in the same transaction as domain changes?
- Are database operations handling constraint violations (UNIQUE, FK) gracefully?
- Is optimistic locking (`@VersionColumn`) used correctly for concurrent updates?
- Are retries bounded? Does the outbox poller increment retryCount and cap at FAILED after 5?

## 4. Performance
- Are N+1 queries avoided? Are relations loaded with JOINs or `relations` option, not lazy?
- Are paginated queries always bounded (max `limit`)?
- Are DB indexes aligned with query patterns?
- Are heavy operations async and non-blocking?
- Is `FOR UPDATE SKIP LOCKED` used in the outbox poller to prevent pod-level contention?

## 5. Observability & Logging
- Is `AppLogger` injected and used (never `console.log`)?
- Are typed log methods used (`logKafkaIncoming`, `logOperationStart`, etc.)?
- Is `traceId` present in all log entries?
- Are errors logged with context (eventId, orderId, etc.) before rethrowing?
- Are sensitive fields never logged (password, token, creditcard)?

## 6. Code Quality
- TypeScript: are types explicit? Are `any` types avoided?
- Are NestJS exceptions (`NotFoundException`, `ConflictException`, `HttpException`) used correctly?
- Is environment configuration accessed via `ConfigService`, not `process.env` directly?
- Are DTOs fully annotated with `class-validator` decorators including `@IsOptional()` where needed?

---

## Output Format

For each issue found:
- **File**: `path/to/file.ts:line`
- **Severity**: 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low
- **Category**: Security | Architecture | Reliability | Performance | Observability | Code Quality
- **Issue**: Clear description
- **Fix**: Specific code change or guidance

End with a **Summary Table** of all findings sorted by severity.
If no issues found in a dimension, explicitly state it as ✅ Clear.
