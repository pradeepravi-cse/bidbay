---
description: Audit dependencies for security vulnerabilities and outdated packages
allowed-tools: Read, Bash(pnpm:*)
model: sonnet
---

You are a senior security engineer and dependency manager. Perform a comprehensive dependency audit.

---

## Step 1 — Run security audit

!`pnpm audit --json 2>&1 | head -200`

!`pnpm audit 2>&1`

---

## Step 2 — Check for outdated packages

!`pnpm outdated 2>&1`

---

## Step 3 — Read current dependencies

Read `package.json` to understand what is pinned vs ranged:
@package.json

---

## Step 4 — Analyze results

### Security Vulnerabilities
For each finding from `pnpm audit`:
- Package name and version
- CVE/advisory ID
- Severity: Critical | High | Moderate | Low
- Vulnerable path (which package depends on it)
- Fix: version to upgrade to
- Breaking change risk: yes/no

### High-Risk Package Watch List
Check these packages specifically (high CVE history in the ecosystem):

| Package | Risk Area |
|---------|-----------|
| `kafkajs` | Deserialization, connection handling |
| `typeorm` | SQL injection via raw queries |
| `class-validator` | Prototype pollution (CVE-2019-18413 pattern) |
| `class-transformer` | Prototype pollution |
| `@nestjs/core` | Dependency chain vulnerabilities |
| `nestjs-pino` | Log injection |
| `pg` (node-postgres) | SQL injection via format strings |

### Outdated Analysis
For each significantly outdated package:
- Current version vs latest version
- Major version gap (breaking changes likely)
- Recommended upgrade path
- Priority: upgrade now | plan for next sprint | monitor

---

## Step 5 — Dependency hygiene checks

Review `package.json` for:
- **Pinned vs ranged**: Are critical security packages pinned (`"1.2.3"` not `"^1.2.3"`)?
- **Dev-only in devDependencies**: Are testing tools (jest, ts-jest) correctly in `devDependencies`?
- **Peer dependency conflicts**: Any warnings from pnpm about peer deps?
- **Unused packages**: Any imports that might have been removed from code but still in package.json?

---

## Step 6 — Action plan

Output a prioritized action table:

| Priority | Package | Action | Breaking Risk | Effort |
|----------|---------|--------|--------------|--------|
| P0 - Do Now | ... | Upgrade to X.Y.Z (Critical CVE) | Low/High | 30 min |
| P1 - This Sprint | ... | Upgrade to X.Y.Z | Medium | 2 hrs |
| P2 - Backlog | ... | Plan major version migration | High | 1 day |

Also provide the exact `pnpm update` command(s) to run for P0 items.
