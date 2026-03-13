# BidBay -- API & Communication Flow Design Document

## Architecture Style

-   Domain Driven Design (DDD)
-   CQRS (Command Query Responsibility Segregation)
-   SAGA Pattern (**Choreography** — no central orchestrator; each service reacts to events)
-   Transactional Outbox + Inbox (reliable Kafka delivery + idempotency)
-   Apache Kafka Event Bus
-   API Gateway (Single Entry Point)

> Note: "Event Sourcing" is listed as a future pattern. The current implementation persists the latest state to relational tables (not event logs).

---

## Currently Implemented APIs

All routes are exposed through the API Gateway at `http://localhost:3000`.

### Orders (→ Order Service :3001)

| Method | Path | Status | Request Body | Notes |
|--------|------|--------|-------------|-------|
| POST | /api/orders | 202 | `{ userId: UUID, items: [{sku, quantity, price}] }` | Returns `{orderId, status: PENDING, totalAmount, createdAt}` |
| GET | /api/orders | 200 | — | Query: `userId` (UUID), `status?` (PENDING\|CONFIRMED\|CANCELLED), `page?` (default 1), `limit?` (default 10, max 50) |
| GET | /api/orders/:orderId | 200/404 | — | Returns full Order entity |

### Inventory (→ Inventory Service :3002)

| Method | Path | Status | Request Body | Notes |
|--------|------|--------|-------------|-------|
| POST | /api/inventory | 201 | `{ sku: string, availableQty: number }` | 409 if SKU already exists |
| PATCH | /api/inventory/:sku | 200 | `{ availableQty: number }` | 404 if SKU not found |
| GET | /api/inventory | 200 | — | Returns `{ data: Inventory[], total }` |
| GET | /api/inventory/:sku | 200/404 | — | Returns full Inventory entity |

### Kafka Topics (Implemented)

| Topic | Producer | Consumer Group | Meaning |
|-------|----------|---------------|---------|
| `order.created` | Order Service | `inventory-service` | New order placed |
| `inventory.reserved` | Inventory Service | `order-service` | Stock reserved successfully |
| `inventory.failed` | Inventory Service | `order-service` | Insufficient stock |

---

## Planned Services (Not Yet Implemented)

The following services are defined in the BRD but not yet built.

------------------------------------------------------------------------

# 1. Identity Service

## Base Path

/api/v1/auth

## Commands

  Method   Endpoint    Description
  -------- ----------- ----------------------
  POST     /register   Register new user
  POST     /login      Authenticate user
  POST     /refresh    Refresh access token
  POST     /logout     Logout session

------------------------------------------------------------------------

## Communication Flow -- User Registration

    Client
      │
      ▼
    API Gateway
      │
      ▼
    Identity Service (RegisterUserCommand)
      │
      ├── Save User Aggregate
      ├── Append Event: UserRegistered
      └── Publish Event → Kafka (user.registered)
             │
             ├── User Service (Create profile)
             └── Notification Service (Send welcome email)

------------------------------------------------------------------------

# 2. User Service

## Base Path

/api/v1/users

## Commands

  Method   Endpoint
  -------- ------------------
  PUT      /{id}/verify-kyc
  PUT      /{id}/suspend

## Queries

  Method   Endpoint
  -------- --------------
  GET      /{id}
  GET      /{id}/rating

------------------------------------------------------------------------

# 3. Auction Service

## Base Path

/api/v1/auctions

## Commands

  Method   Endpoint
  -------- ---------------
  POST     /
  PUT      /{id}/publish
  PUT      /{id}/cancel
  PUT      /{id}/close

## Queries

  Method   Endpoint
  -------- -----------------
  GET      /{id}
  GET      /?status=active
  GET      /{id}/bids

------------------------------------------------------------------------

# 4. Bid Service

## Base Path

/api/v1/bids

## Commands

  Method   Endpoint
  -------- ----------
  POST     /

## Queries

  Method   Endpoint
  -------- ----------------------
  GET      /auction/{auctionId}
  GET      /user/{userId}

------------------------------------------------------------------------

# 5. Wallet Service

## Base Path

/api/v1/wallet

## Commands

  Method   Endpoint
  -------- -----------
  POST     /deposit
  POST     /withdraw
  POST     /reserve
  POST     /release

## Queries

  Method   Endpoint
  -------- ------------------------
  GET      /{userId}
  GET      /{userId}/transactions

------------------------------------------------------------------------

# 6. Payment Service

## Base Path

/api/v1/payments

  Method   Endpoint
  -------- --------------
  POST     /initiate
  POST     /webhook
  GET      /{paymentId}

------------------------------------------------------------------------

# 7. Notification Service

## Base Path

/api/v1/notifications

  Method   Endpoint
  -------- -----------
  POST     /email
  POST     /sms
  GET      /{userId}

------------------------------------------------------------------------

# 8. Search Service

## Base Path

/api/v1/search

  Method   Endpoint
  -------- ----------
  GET      /?query=
  GET      /filter

------------------------------------------------------------------------

# 9. Admin Service

## Base Path

/api/v1/admin

  Method   Endpoint
  -------- ------------------------
  GET      /auctions/pending
  PUT      /auctions/{id}/approve
  PUT      /users/{id}/ban

------------------------------------------------------------------------

# Kafka Topics

## Implemented

| Topic | Producer | Consumer(s) |
|-------|----------|-------------|
| `order.created` | Order Service | Inventory Service |
| `inventory.reserved` | Inventory Service | Order Service |
| `inventory.failed` | Inventory Service | Order Service |

## Planned (Future Services)

| Topic | Producer | Consumer(s) |
|-------|----------|-------------|
| `user.registered` | Identity | User, Notification |
| `user.kyc.verified` | User | Auction |
| `auction.created` | Auction | Search, Notification |
| `bid.requested` | Bid | Wallet |
| `funds.reserved` | Wallet | Bid |
| `payment.completed` | Payment | Wallet |
| `auction.closed` | Auction | Wallet, Notification |
| `wallet.credited` | Wallet | Notification |
| `bid.outbid` | Bid | Notification |

------------------------------------------------------------------------

# Global Communication Architecture

                       ┌───────────────┐
                       │ API Gateway   │
                       └───────┬───────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
       Identity           Auction Service       Bid Service
            │                  │                  │
            └──────────┬───────┴──────────┬───────┘
                       ▼                  ▼
                    Kafka Event Bus (Event Store)
                       │
            ┌──────────┼────────────┬────────────┐
            ▼          ▼            ▼            ▼
          Wallet    Notification   Search      Payment

------------------------------------------------------------------------

Total ≈ 35--40 Endpoints
