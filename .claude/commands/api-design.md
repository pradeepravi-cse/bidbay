---
description: Review or design an API endpoint — REST conventions, contracts, validation, versioning
argument-hint: [endpoint description or file path]
allowed-tools: Read, Grep
model: opus
---

You are a senior API architect. Review or design the API for: `$ARGUMENTS`

If `$ARGUMENTS` is a file path, read it. If it's a description, design from scratch.

First, read the existing API surface to understand current conventions:
- `api/api-gateway/src/orders/orders.controller.ts`
- `api/api-gateway/src/orders/orders.service.ts`
- `api/api-gateway/src/orders/dto/`
- `api/api-gateway/src/inventory/inventory.controller.ts`
- `api/api-gateway/src/inventory/dto/`

---

## API Design Review / Design Checklist

### REST Conventions
- **Resource naming**: Are nouns used? (`/orders` not `/createOrder`)
- **HTTP verbs**: GET (read), POST (create), PUT (full replace), PATCH (partial update), DELETE
- **Status codes**:
  - 200 — synchronous success with body
  - 201 — resource created, include `Location` header with new resource URL
  - 202 — accepted for async processing (SAGA pattern — correct for POST /orders)
  - 204 — success, no body (DELETE)
  - 400 — validation failure (return field-level errors)
  - 401 — not authenticated
  - 403 — authenticated but not authorized
  - 404 — resource not found
  - 409 — conflict (duplicate SKU, etc.)
  - 422 — unprocessable entity (valid JSON but semantic error)
  - 429 — rate limit exceeded
  - 500 — internal server error (never expose details)
- **Idempotency**: Are POST endpoints idempotent where possible? (idempotency key header)
- **Pagination**: Are list endpoints paginated? Format: `{ data: T[], total: number, page: number, limit: number }`

### Request Contracts
- Are all input fields validated at the DTO level with `class-validator`?
- Are `@IsUUID()`, `@IsEnum()`, `@IsInt()`, `@Min()`, `@Max()` used appropriately?
- Is `ValidationPipe({ whitelist: true })` stripping unknown fields?
- Are numeric strings transformed with `@Type(() => Number)`?
- Is `@IsOptional()` used only where the field is truly optional?
- Are default values documented (`@ApiPropertyOptional({ default: 1 })` or equivalent)?

### Response Contracts
- Are responses typed consistently? (no raw TypeORM entities — use response DTOs or mapped types)
- Are sensitive fields stripped from responses? (passwords, internal IDs not needed by client)
- Are timestamps in ISO 8601 format?
- Are amounts as strings (decimal precision) or numbers? Be consistent.
- Are errors in a standard format? Recommended:
  ```json
  { "statusCode": 400, "message": ["field is required"], "error": "Bad Request" }
  ```

### Security
- Are endpoints requiring auth decorated with a guard?
- Is `x-user-id` injected from verified JWT claims (not raw header)?
- Are path parameters validated (`@IsUUID()` on `:orderId` etc.)?
- Is the response body safe for XSS (no unescaped user content in JSON)?
- Are rate limits applied to write endpoints?

### Versioning
- Is API versioning planned? (`/api/v1/orders` or `Accept-Version` header)
- Are any breaking changes being made to existing endpoints?
- For breaking changes: is a deprecation strategy defined?

### Performance
- Are list endpoints bounded (max limit)?
- Are expensive queries triggered by GET requests cached or optimized?
- Is `ETag` / `Last-Modified` used for cacheable resources?

### Documentation
- Are all endpoints documented with OpenAPI/Swagger decorators (`@nestjs/swagger`)?
- Is the request/response schema complete?
- Are error responses documented?
- Are example values provided?

---

## Design Output (if designing new endpoint)

If designing new functionality, output:

### 1. Endpoint Specification
```
METHOD /api/resource[/:param]
Auth: Required | Public
Rate limit: X requests/minute
```

### 2. Request DTO
```typescript
export class XyzDto {
  @IsUUID()
  userId: string;
  // ...
}
```

### 3. Response Shape
```json
{
  "resourceId": "uuid",
  "status": "PENDING",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 4. Error Responses
| Status | When |
|--------|------|
| 400 | Validation failure |
| 404 | Resource not found |
| 409 | Conflict |

### 5. Gateway → Microservice mapping
Which microservice handles this? What route does the gateway proxy to?

### 6. Caveats & Trade-offs
Any design decisions that have trade-offs worth noting.
