---
description: Deep security audit — OWASP, SAST, XSS, injection, auth gaps
allowed-tools: Read, Grep, Bash(git:*)
model: opus
---

You are a senior security engineer performing a SAST-level security audit of this NestJS microservices codebase. Think like Fortify SCA or SonarQube Security rules.

Scan the entire codebase systematically:

**All TypeScript source files:**
!`git ls-files -- '*.ts' | grep -v spec | grep -v node_modules`

**All DTOs:**
!`git ls-files -- '**/*.dto.ts'`

---

## Scan Targets

### A01 — Broken Access Control
- Check every HTTP endpoint: does it require authentication?
- Is `x-user-id` verified via JWT or just passed as a raw header? (CRITICAL gap if raw)
- Are resource ownership checks performed before mutations?
- Are microservice ports (3001, 3002) protected from direct external access?
- Grep for `@Get`, `@Post`, `@Patch`, `@Delete` and verify each has a guard or is intentionally public.

### A02 — Cryptographic Failures
- Are secrets stored in `.env` only, not in code?
- Grep for hardcoded passwords, API keys, tokens: `password|secret|apiKey|token` in source (not tests).
- Is `DB_PASS` and `KAFKA_BROKERS` loaded via `ConfigService`?
- Are any hashes using MD5 or SHA-1 (weak)?

### A03 — Injection (SQL, Command, NoSQL)
- Check all TypeORM usages: are raw queries used? Are they parameterized?
- Grep for `createQueryBuilder` usages — are user inputs safely bound via `.setParameter()`?
- Grep for `query(` direct DB calls — are they parameterized?
- Grep for `exec(`, `spawn(`, `eval(` — command injection risk.
- Check all Kafka payload construction — are payloads JSON-serialized, not string-interpolated?

### A04 — Insecure Design
- Is the outbox pattern correctly implemented? (command + outbox in one transaction)
- Is inbox deduplication implemented for all Kafka consumers?
- Are SAGA failure paths handled (inventory.failed → order CANCELLED)?
- Is `totalAmount` calculated server-side (not trusted from client)?

### A05 — Security Misconfiguration
- Is `synchronize: true` conditional on `NODE_ENV !== 'production'`?
- Are CORS settings configured on the gateway? Are origins explicitly whitelisted?
- Check `main.ts` files: is `app.enableCors()` called with `origin: '*'`? (risk if public API)
- Are error responses stripping stack traces in production?
- Is `ValidationPipe` applied globally with `whitelist: true`?

### A06 — Vulnerable & Outdated Components
- Read `package.json` at root.
- Identify packages with known CVE history: `kafkajs`, `typeorm`, `class-validator`, `nestjs-pino`.
- Flag any packages that are significantly behind major version.

### A07 — Identification & Authentication Failures
- Is JWT validation implemented anywhere in the gateway? Read `api/api-gateway/src/`.
- Are session tokens short-lived and rotated?
- Is there brute-force protection on any auth endpoints?

### A08 — Software and Data Integrity Failures
- Are Kafka messages verified for schema integrity before processing?
- Is the outbox event payload validated before publishing?
- Are `pnpm-lock.yaml` or equivalent lockfiles present and committed?

### A09 — Security Logging & Monitoring Failures
- Is every auth failure logged with `warn` or `error`?
- Are failed inbox inserts (duplicates) distinguished from actual processing failures?
- Are audit logs written for all CREATE, UPDATE, DELETE operations?
- Are sensitive fields redacted in `audit_logs.requestBody`? Check `sanitize()` coverage.

### A10 — Server-Side Request Forgery (SSRF)
- Check gateway proxy services: are upstream URLs hardcoded or from `ConfigService`?
- If URLs come from env vars, are they validated against an allowlist?

### XSS (Cross-Site Scripting)
- Are `Content-Type: application/json` headers enforced on all responses?
- Are security headers present: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`?
- Is any user-supplied content reflected back in error messages without sanitization?

### Sensitive Data Exposure in Logs
- Grep for any logger calls that might include raw request bodies, passwords, or tokens.
- Verify `sanitize()` is applied to `requestBody` in `HttpAuditInterceptor`.
- Check that `audit_logs` table itself is access-controlled.

---

## Output Format

Report findings as:

| # | OWASP Category | File:Line | Severity | Finding | Recommendation |
|---|---------------|-----------|----------|---------|----------------|

Severity scale: 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low | ℹ️ Informational

End with:
1. **Risk Summary**: Total findings by severity
2. **Top 3 Priorities**: Most impactful fixes to implement first
3. **Positive Controls**: Security controls that ARE correctly implemented (celebrate them)
