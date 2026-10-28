# Day 8 Assignment: TicketHub System Design

TicketHub is an online ticketing platform for concerts, sporting events, and theater productions. Fans browse events, choose seats, pay, and receive scannable tickets. Most days are quiet, but a popular on-sale can bring hundreds of thousands of people to a limited inventory at once.

### Goals
- Never sell the same seat to two people.
- Stay responsive during high-demand sales by shaping traffic rather than allowing a flash crowd to overwhelm the system.
- Keep the queue fair and normal event browsing fast.

### Non-goals
- Ticket resale or transfers between fans.
- Self-service refunds and exchanges (handled by support).
- A full event-organiser admin portal; staff add events.
- Recommendations, reviews, social features, or native mobile apps.

---

## 1. Requirements

### Functional Requirements
1. Users can register, log in, and log out.
2. Anyone can browse and search events by name, city, and date, and view event details, venue, date, seating layout, and pricing tiers.
3. Anyone can view an event seat map with `available`, `held`, or `sold` status.
4. An authenticated user can hold up to 4 available seats for an event for 10 minutes, release a hold early, or pay for held seats.
5. On successful payment, the order is confirmed and a unique scannable ticket code is issued for each seat.
6. Users can view their order history and tickets; TicketHub sends a confirmation email after payment.
7. An expired unpaid hold is released automatically. During high-demand sales, users enter a virtual waiting room before the purchase flow.
8. Repeated checkout requests with the same idempotency key never charge the user twice.

### Non-Functional Requirements
- **Correctness (Zero Double-Booking):** Under no circumstance may two different users purchase or hold the exact same seat. Transactional consistency for inventory changes is non-negotiable; PostgreSQL row locks, conditional updates, and unique constraints enforce it.
- **Speed & Latency:**
  - Cached event browsing and seating-map responses target `< 150 ms`.
  - A seat-hold request targets `< 500 ms`.
  - Checkout completion depends on the external payment provider; the API acknowledges and reports payment state without holding database locks during the provider call.
- **Fairness:**
  - People present before a sale opens receive a randomized queue order; later arrivals join first-come, first-served.
  - Enforce a maximum of 4 tickets per user per event, one queue place per account, and rate limits to reduce bot and refresh advantages.
- **High Availability & Fault Tolerance:**
  - Target 99.95% uptime and degrade gracefully during flash crowds by queuing rather than crashing.
  - If the payment provider is unavailable, preserve the order/hold state and reconcile the outcome without leaking or double-selling inventory.
- **Security:** HTTPS everywhere; passwords are stored as hashes; card details are handled by the payment provider and are not stored by TicketHub.

For purchases, correctness takes priority over availability: if the primary database cannot safely confirm inventory, holds and payments pause. Browsing can continue from cache.

---

## 2. Traffic Estimates: Normal vs. Big Sale

### Baseline Assumptions
| Parameter | Value |
|---|---|
| Registered Users | 2,000,000 |
| Normal Day Visitors (DAU) | 50,000 users |
| Pages viewed per normal visitor | 10 pages |
| Tickets sold on a normal day | 5,000 tickets |
| "Big Sale" Concert Capacity | 20,000 seats |
| "Big Sale" Interested Visitors | 200,000 users in the first 10 minutes |
| Effective seconds per day | 86,400 (≈ 100,000 for estimation) |

---

### A. Normal Day Traffic
```text
1. Page Views:
   50,000 visitors × 10 pages = 500,000 page views / day
   500,000 ÷ 86,400 s         ≈ 5.8 page views / second (average)
   Peak (3× average)          ≈ 18 page views / second

2. Read API Requests (assets, event data, seat status):
   Assuming ~3 API calls per page view:
   500,000 × 3 = 1,500,000 requests / day
   Average Read Throughput:    ≈ 17 requests / second
   Peak Read Throughput:       ≈ 50 requests / second

3. Ticket Sales (Writes):
   5,000 tickets sold / day
   5,000 ÷ 86,400 s           ≈ 0.058 purchases / second
   Average: 1 ticket sale every ~17 seconds
   Peak Write Throughput:     ≈ 0.3 purchases / second
```

**Approximate storage growth**
- Users: 2,000,000 × ~1 KB ≈ **2 GB**.
- Tickets: 5,000/day × 365 ≈ 1.8 million × ~0.5 KB ≈ **1 GB/year**.
- Seats: ~1,000 events/year × 5,000 seats × ~100 bytes ≈ **0.5 GB/year**.
- Event images are stored in object storage, not in PostgreSQL.

At this baseline, one application server and one relational database are sufficient; the Big Sale drives the need to scale.

---

### B. "Big Sale" Peak (Popular Concert Drop)
A stadium concert (20,000 seats) goes on sale at 10:00 AM. 200,000 users flood the system simultaneously within the first 10 minutes (600 seconds).

```text
1. User Demand Ratio:
   200,000 users competing for 20,000 seats = 10 buyers per seat (10:1 ratio).

2. Read & Interaction Requests:
   Users aggressively refresh, load seating maps, and poll availability.
   Assuming each user triggers 15 requests over 10 minutes:
   200,000 users × 15 requests = 3,000,000 requests in 600 seconds
   Average Read Throughput:     3,000,000 ÷ 600 s = 5,000 requests / second (RPS)
   Opening Burst (first 60s):   10,000 – 15,000 RPS

3. Write Requests (Hold & Checkout Attempts):
   Hold attempts can reach ≈1,666/s in the opening minute, before queueing.
   The useful write rate is bounded by inventory: at most 20,000 seats can be held.
   If those seats are held in ~120 seconds, that is ≈167 successful seat reservations/s
   (about 83 orders/s at 2 seats/order). A queue admitting ~3,000 shoppers/minute
   initially lets in about 50 shoppers/s, plus retries; tune this to measured capacity.
```

---

### C. Normal vs. Big Sale Comparison

| Metric | Normal Day | Big Sale Peak (10 min) | Factor Increase |
|---|---|---|---|
| **Active Users / Period** | 50,000 / 24 hours | 200,000 / 10 minutes | **~576× rate** |
| **Read Throughput** | ~17 RPS (avg) / 50 RPS (peak) | 5,000 RPS (avg) / 15,000 RPS (peak) | **~300× – 500×** |
| **Write / Hold Throughput** | ~0.06 purchases / second | ~1,666 unthrottled hold attempts / second | **~28,000×** |
| **Row Contention** | Near zero (spread across events) | Extreme (200k users targeting 20k rows) | **Massive contention** |

**Key Takeaway:** A standard database easily handles normal traffic (about 17 read RPS and 0.06 purchases/s). During a Big Sale, unfiltered traffic risks saturating database connections and creating severe row contention. An edge waiting room meters writes, caches absorb repeated event/map reads, and atomic database transactions protect inventory. The 1,666/s figure is an unthrottled attempt estimate, not the target database throughput.

---

## 3. API Design

All endpoints are under `https://tickethub.example/api/v1`, use HTTPS and JSON, and use standard HTTP status codes. 🔒 indicates an authenticated endpoint. Registration, login, and logout use `POST /users`, `POST /sessions`, and `DELETE /sessions`.

| Method & path | Purpose | Success | Common errors |
|---|---|---|---|
| `GET /events?q=&city=&date=` | Browse and search events | `200 OK` | `400 Bad Request` |
| `GET /events/{eventId}` | Event details | `200 OK` | `404 Not Found` |
| `GET /events/{eventId}/seats` | Seat map | `200 OK` | `404 Not Found` |
| `DELETE /sessions` 🔒 | Log out | `204 No Content` | `401 Unauthorized` |
| `POST /events/{eventId}/queue` 🔒 | Join the waiting room | `202 Accepted` | `409 Conflict` if already queued |
| `GET /queue/{queueToken}` 🔒 | Check position/admission | `200 OK` | `404 Not Found` |
| `POST /events/{eventId}/holds` 🔒 | Hold seats for 10 minutes | `201 Created` | `409`, `422`, `429` |
| `DELETE /holds/{orderId}` 🔒 | Release a hold early | `204 No Content` | `404`, `409` if already paid |
| `POST /orders/checkout` 🔒 | Pay for a hold and confirm tickets | `200 OK` | `402`, `409`, `410` |
| `GET /me/orders` 🔒 | List my orders | `200 OK` | `401 Unauthorized` |
| `GET /me/tickets` 🔒 | List my tickets and codes | `200 OK` | `401 Unauthorized` |

### 1. `GET /api/v1/events`
Browse and filter events.
- **Query Parameters:** `q`, `category`, `city`, `page`, `limit`
- **Response `200 OK`:**
```json
{
  "events": [
    {
      "id": "evt_987",
      "title": "Cosmic Symphony Tour",
      "venue": "Nairobi Arena",
      "start_time": "2026-12-15T20:00:00Z",
      "starting_price_cents": 4500,
      "status": "ON_SALE"
    }
  ],
  "page": 1,
  "total_pages": 4
}
```

---

### 2. `GET /api/v1/events/{eventId}/seats`
Retrieve the seating chart and live seat statuses for an event.
- **Authentication:** Public endpoint. The response may be cached for 1–2 seconds; the database remains authoritative when placing a hold.
- **Response `200 OK`:**
```json
{
  "event_id": "evt_987",
  "sections": [
    {
      "section": "VIP",
      "seats": [
        { "id": "st_101", "row": "A", "number": 1, "price_cents": 12000, "status": "AVAILABLE" },
        { "id": "st_102", "row": "A", "number": 2, "price_cents": 12000, "status": "HELD" },
        { "id": "st_103", "row": "A", "number": 3, "price_cents": 12000, "status": "SOLD" }
      ]
    }
  ]
}
```

---

### 3. `POST /api/v1/events/{eventId}/holds`
Attempt to place a temporary 10-minute hold on selected seats.
- **Headers:** Authenticated request; `Idempotency-Key: <uuid>`
- Repeating the same key returns the original hold result instead of creating another hold.
- **Request Body:**
```json
{
  "seat_ids": ["st_101", "st_104"]
}
```
- **Response `201 Created`:**
```json
{
  "order_id": "ord_88129",
  "hold_token": "hld_4a9b2c3d",
  "seat_ids": ["st_101", "st_104"],
  "total_amount_cents": 24000,
  "expires_at": "2026-10-28T22:10:00Z",
  "ttl_seconds": 600
}
```
- **Error Responses:**
  - `409 Conflict`: `{"error": "SEATS_UNAVAILABLE", "message": "One or more selected seats are already held or sold."}`
  - `422 Unprocessable Entity`: too many seats or the user would exceed the event ticket limit.
  - `429 Too Many Requests`: `{"error": "RATE_LIMITED", "message": "Queue token required."}`

---

### 4. `POST /api/v1/orders/checkout`
Submit payment and complete the purchase for held seats.
- **Headers:** Authenticated request; `Idempotency-Key: <uuid>`
- **Request Body:**
```json
{
  "hold_token": "hld_4a9b2c3d",
  "payment_method_id": "pm_card_visa_4242",
  "billing_details": {
    "name": "Jane Doe",
    "email": "jane@example.com"
  }
}
```
- **Response `200 OK`:**
```json
{
  "order_id": "ord_88129",
  "event_id": "evt_987",
  "total_amount_cents": 24000,
  "status": "PAID",
  "ticket_ids": ["tkt_001", "tkt_002"]
}
```
- **Error Responses:**
  - `410 Gone`: `{"error": "HOLD_EXPIRED", "message": "Your hold expired before payment was processed."}`
  - `402 Payment Required`: `{"error": "PAYMENT_FAILED", "message": "Card declined."}`

---

### 5. `GET /api/v1/me/tickets`
View confirmed tickets and barcodes for the authenticated user.
- **Headers:** Authenticated request
- **Response `200 OK`:**
```json
{
  "tickets": [
    {
      "ticket_id": "tkt_001",
      "order_id": "ord_88129",
      "event_title": "Cosmic Symphony Tour",
      "venue": "Nairobi Arena",
      "start_time": "2026-12-15T20:00:00Z",
      "seat": { "section": "VIP", "row": "A", "number": 1 },
      "qr_code_payload": "https://tickethub.com/verify/tkt_001?sig=9f8c3...",
      "status": "VALID"
    }
  ]
}
```

---

## 4. Data Model

The relational schema is implemented in PostgreSQL to provide strict ACID guarantees, foreign key constraints, and transactional row locking. Public API identifiers are opaque representations of the UUIDs stored internally.

```
       ┌────────────────────────┐
       │         users          │
       ├────────────────────────┤
       │ id (PK)                │◄─────────┐
       │ email (UQ)             │          │
       │ password_hash          │          │
       │ name                   │          │
       │ created_at             │          │
       └────────────────────────┘          │
                   │                       │
                   │ 1:N                   │ 1:N
                   ▼                       │
       ┌────────────────────────┐          │
       │         orders         │          │
       ├────────────────────────┤          │
       │ id (PK)                │          │
       │ user_id (FK)           ├──────────┘
       │ event_id (FK)          ├──────────┐
       │ total_amount_cents     │          │
       │ status                 │          │
       │ hold_token             │          │
       │ expires_at             │          │
       │ idempotency_key        │          │
       │ checkout_idem_key      │          │
       │ payment_ref            │          │
       │ created_at             │          │
       │ paid_at                │          │
       └────────────────────────┘          │
                   │                       │
                   │ 1:N                   │
                   ▼                       ▼
       ┌────────────────────────┐   ┌────────────────────────┐
       │      order_items       │   │         events         │
       │       (tickets)        │   ├────────────────────────┤
       ├────────────────────────┤   │ id (PK)                │
       │ id (PK)                │   │ title                  │
       │ order_id (FK)          │   │ venue                  │
       │ seat_id (FK, UQ)       │   │ city                   │
       │ price_cents            │   │ start_time             │
       │ qr_code_hash           │   │ on_sale_at             │
       │                        │   │ total_seats            │
       │                        │   │ max_tickets_per_user   │
       │                        │   │ status                 │
       │                        │   │ image_url              │
       │                        │   │ created_at             │
       └────────────────────────┘   └────────────────────────┘
                   │                             │
                   │ 1:1                         │ 1:N
                   ▼                             ▼
       ┌─────────────────────────────────────────────────────┐
       │                        seats                        │
       ├─────────────────────────────────────────────────────┤
       │ id (PK)                                             │
       │ event_id (FK)                                       │
       │ section                                             │
       │ row                                                 │
       │ seat_number                                         │
       │ price_cents                                         │
       │ status ('AVAILABLE', 'HELD', 'SOLD')                │
       │ order_id (FK, nullable)                             │
       │ held_until (nullable)                               │
       │ version (INT, row version)                           │
       └─────────────────────────────────────────────────────┘
```

### Table Definitions

#### 1. `users`
Represents customer accounts.
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 2. `events`
Represents concerts, games, or events.
```sql
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    venue VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    on_sale_at TIMESTAMP WITH TIME ZONE NOT NULL,
    total_seats INT NOT NULL,
    max_tickets_per_user INT NOT NULL DEFAULT 4 CHECK (max_tickets_per_user > 0),
    image_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'ON_SALE', 'SOLD_OUT', 'CANCELLED', 'FINISHED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3. `seats`
Represents physical seats for an event. Includes reservation states and locks.
```sql
CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    section VARCHAR(50) NOT NULL,
    row VARCHAR(10) NOT NULL,
    seat_number INT NOT NULL,
    price_cents INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' 
        CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
    order_id UUID NULL,
    held_until TIMESTAMP WITH TIME ZONE NULL,
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_event_seat UNIQUE (event_id, section, row, seat_number),
    CONSTRAINT ck_seat_order_state CHECK (
        (status = 'AVAILABLE' AND order_id IS NULL AND held_until IS NULL)
        OR (status = 'HELD' AND order_id IS NOT NULL AND held_until IS NOT NULL)
        OR (status = 'SOLD' AND order_id IS NOT NULL AND held_until IS NULL)
    )
);

CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_seats_hold_expiry ON seats(held_until) WHERE status = 'HELD';
```

#### 4. `orders` & `order_items`
Represents completed financial transactions and assigned tickets.
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    event_id UUID NOT NULL REFERENCES events(id),
    total_amount_cents INT NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'HELD'
        CHECK (status IN ('HELD', 'PAYING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED')),
    hold_token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    checkout_idempotency_key VARCHAR(100) UNIQUE,
    payment_ref VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE NULL
);

ALTER TABLE seats
    ADD CONSTRAINT fk_seats_order FOREIGN KEY (order_id) REFERENCES orders(id);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_id UUID UNIQUE NOT NULL REFERENCES seats(id),
    price_cents INT NOT NULL,
    qr_code_hash VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_event_status ON orders(event_id, status);
CREATE INDEX idx_tickets_order ON order_items(order_id);
```

### Design notes

- Money is stored in integer cents to avoid decimal rounding errors.
- `CHECK` constraints reject invalid event, order, and seat states.
- `UNIQUE` constraints prevent duplicate event seats, tickets for the same seat, repeated hold idempotency keys, and duplicate provider payment references.
- A hold is an `orders` row in `HELD` status. Its `hold_token` is returned to the buyer; seat rows point to that order while held or sold. The database, not Redis, is authoritative for this relationship.

---

## 5. Preventing Double-Booking: Transactions and Constraints

Double-booking occurs when two concurrent requests read seat status as `AVAILABLE` and both write reservations. TicketHub prevents double-booking through three defense layers:

### Layer 1: Atomic Database Hold with Pessimistic Row Locking
When a user requests to hold seats, the application executes a single transaction utilizing `SELECT ... FOR UPDATE`:

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Serialize this user's event-limit check with any other concurrent hold.
SELECT id FROM users WHERE id = :user_id FOR UPDATE;

SELECT COUNT(*)
FROM seats s
JOIN orders o ON o.id = s.order_id
WHERE o.user_id = :user_id
  AND o.event_id = :event_id
  AND o.status IN ('HELD', 'PAYING', 'PAID')
  AND (
      s.status = 'SOLD'
      OR (s.status = 'HELD' AND s.held_until > NOW())
  );
-- Roll back if this count plus requested seats exceeds the event limit.

-- Create the hold record first; the application supplies random tokens/keys.
INSERT INTO orders (
    user_id, event_id, status, hold_token, expires_at, idempotency_key
)
VALUES (
    :user_id, :event_id, 'HELD', :hold_token,
    NOW() + INTERVAL '10 minutes', :hold_idempotency_key
)
RETURNING id;
-- Bind the returned id as :order_id in the remaining statements.

-- Lock requested seats in a stable order to reduce deadlocks.
SELECT id, status, held_until
FROM seats
WHERE id = ANY(:seat_ids) AND event_id = :event_id
ORDER BY id
FOR UPDATE;

-- The application verifies that every requested row was found and is
-- AVAILABLE, or HELD with an expired lease. Otherwise roll back and return 409.
UPDATE seats
SET status = 'HELD',
    order_id = :order_id,
    held_until = NOW() + INTERVAL '10 minutes',
    version = version + 1
WHERE id = ANY(:seat_ids)
  AND event_id = :event_id
  AND (
      status = 'AVAILABLE'
      OR (
          status = 'HELD'
          AND held_until <= NOW()
          AND EXISTS (
              SELECT 1
              FROM orders previous_order
              WHERE previous_order.id = seats.order_id
                AND previous_order.status IN ('HELD', 'EXPIRED')
                AND previous_order.expires_at <= NOW()
          )
      )
  );

-- If the affected-row count differs from the requested-seat count, roll back.
-- Apply the per-user/event ticket limit in this same transaction.
UPDATE orders
SET total_amount_cents = (
    SELECT SUM(price_cents) FROM seats WHERE order_id = :order_id
)
WHERE id = :order_id;

COMMIT;
```

**Why this works:** `SELECT ... FOR UPDATE` acquires row-level locks in PostgreSQL. A competing transaction waits, then rechecks the seat state; it either updates zero rows or fails the all-or-nothing row-count check and returns `409 Conflict`. The API never trusts the cached seat map for inventory decisions. The per-user event ticket cap is checked inside the transaction while locking the user's row, so simultaneous holds cannot exceed the limit.

---

### Layer 2: Payment outside database transactions
The hold token resolves to an order. Checkout first claims the order for payment in a short database transaction, extending its hold briefly; the payment-provider request then runs **outside** any database transaction. This avoids holding row locks or a database connection during a slow network call.

```sql
BEGIN;

UPDATE orders
SET status = 'PAYING',
    expires_at = GREATEST(expires_at, NOW() + INTERVAL '5 minutes'),
    checkout_idempotency_key = :checkout_idempotency_key
WHERE id = :order_id
  AND user_id = :user_id
  AND hold_token = :hold_token
  AND status = 'HELD'
  AND expires_at > NOW()
RETURNING id, event_id, total_amount_cents;

UPDATE seats
SET held_until = GREATEST(held_until, NOW() + INTERVAL '5 minutes')
WHERE order_id = :order_id AND status = 'HELD';
-- Verify that the order still owns its full set of unexpired seats; otherwise roll back.

COMMIT;
```

If the order update returns no row, roll back; the hold has expired, is not owned by the user, or is already being processed, so return the appropriate `410 Gone` or `409 Conflict`. Also roll back if the seat check does not find the full held set. An identical checkout idempotency key returns its previously recorded outcome. Call the payment provider using that key. On decline, set the order back to `HELD` in a short transaction and preserve its updated expiry so the user can retry with another payment method and a new key. A timeout with an unknown provider result remains `PAYING` until reconciliation or a webhook resolves it; do not release its seats while the charge outcome is unknown.

After payment success, finalize inventory and issue tickets in another short transaction:

```sql
BEGIN;

SELECT id FROM orders
WHERE id = :order_id AND status = 'PAYING'
FOR UPDATE;

UPDATE seats
SET status = 'SOLD', held_until = NULL, version = version + 1
WHERE order_id = :order_id AND status = 'HELD' AND held_until > NOW();
-- The application verifies that all held seats were transitioned.

-- The application inserts one row per sold seat with a distinct generated hash.
-- Two-seat example; insert one row for every seat in the order (up to four).
INSERT INTO order_items (order_id, seat_id, price_cents, qr_code_hash)
VALUES
    (:order_id, :seat_id_1, :price_1, :qr_hash_1),
    (:order_id, :seat_id_2, :price_2, :qr_hash_2);

UPDATE orders
SET status = 'PAID', payment_ref = :payment_ref, paid_at = NOW()
WHERE id = :order_id AND status = 'PAYING';

COMMIT;
```

The payment gateway webhook is also idempotent and can resume finalization if the application loses its connection after a successful charge. If finalization cannot safely complete, a worker reconciles the provider result and refunds the charge; it never creates a paid order without its tickets.

---

### Layer 3: Database-Level UNIQUE Constraint Safety Net
Even in the event of an unforeseen application bug, race condition, or faulty cache layer, the table schema contains an unbreakable constraint:
```sql
CONSTRAINT uq_order_items_seat_id UNIQUE (seat_id)
```
Because `order_items.seat_id` is strictly `UNIQUE`, the database engine will physically throw an integrity violation error if any process ever tries to insert a duplicate ticket for a seat.

---

### Handling Abandoned Holds (Deadlock & Expiry Prevention)
1. **Lazy Expiration:** A seat is reclaimable only when its lease has passed and its owning order is no longer `PAYING`. Checkout verifies that the same order still owns its seats and that the hold is valid before contacting the provider. A reconciliation worker queries the payment provider for stale `PAYING` orders; it finalizes confirmed payments or releases seats only after confirming that no charge succeeded.
2. **Active Sweeper:** A lightweight worker runs every 30 seconds to mark expired orders and release their seats:
   ```sql
   BEGIN;
   UPDATE orders SET status = 'EXPIRED'
   WHERE status = 'HELD' AND expires_at < NOW();

   UPDATE seats s
   SET status = 'AVAILABLE', order_id = NULL, held_until = NULL
   FROM orders o
   WHERE s.order_id = o.id
     AND s.status = 'HELD'
     AND s.held_until < NOW()
     AND o.status = 'EXPIRED';
   COMMIT;
   ```

---

## 6. Architecture & Surviving the Big Sale

### Architecture Diagram

```text
                           ┌──────────────────────────┐
                           │      Public Internet     │
                           └─────────────┬────────────┘
                                         │
                                         ▼
                           ┌──────────────────────────┐
                           │    Cloudflare CDN &      │
                           │   Virtual Waiting Room   │  (Queue-it / Token Bucket)
                           └─────────────┬────────────┘
                                         │ Capacity-tuned admission
                                         ▼
                           ┌──────────────────────────┐
                           │   Layer 7 Load Balancer  │  (SSL termination, WAF)
                           └─────────────┬────────────┘
                                         │
                ┌────────────────────────┼────────────────────────┐
                ▼                        ▼                        ▼
       ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
       │   App Server 1  │      │   App Server 2  │      │   App Server N  │
       │  (Stateless API)│      │  (Stateless API)│      │  (Stateless API)│
       └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
                │                        │                        │
                ├────────────────────────┼────────────────────────┤
                │                        │                        │
                ▼                        ▼                        ▼
       ┌───────────────────────────────────────────────────────────────────┐
       │                        Redis Cluster                              │
       │  - Seat status bitmap (fast reads)                                │
       │  - Rate limiting & session tokens                                 │
       │  - Queue admission tokens                                         │
       └────────────────┬──────────────────────────────────────────────────┘
                        │
                ┌───────┴────────────────────────┐
                ▼                                ▼
       ┌─────────────────┐              ┌─────────────────┐
       │ Primary DB      │              │ Read Replicas   │
       │ (PostgreSQL)    │─────────────>│ (PostgreSQL)    │
       │ - ACID Writes   │  Replication │ - Event browsing│
       │ - Row Locks     │              │ - User tickets  │
       └────────┬────────┘              └─────────────────┘
                │
                ├────────────────────────────────┐
                ▼                                ▼
       ┌─────────────────┐              ┌─────────────────┐
       │  Message Queue  │              │ Payment Gateway │
       │ (RabbitMQ/SQS)  │              │ (Stripe API)    │
       └────────┬────────┘              └─────────────────┘
                │
                ▼
       ┌─────────────────┐
       │ Worker Service  │
       │ - Email tickets │
       │ - Expire holds  │
       └─────────────────┘
```

---

### Component Explanations

- **Cloudflare CDN & Edge Caching:** Caches static web assets, venue floor plans, and public event descriptions at edge servers worldwide, reducing repeat reads at the origin.
- **Object Storage:** Stores event posters and venue images outside PostgreSQL; the database keeps only their URLs and the CDN delivers the files.
- **Virtual Waiting Room (Traffic Shaping):** During a Big Sale, the waiting room protects origin services from the 200,000-user burst. It gives users a signed queue token, randomizes users already waiting when the sale opens, and places later arrivals in first-come, first-served order. Admission is capacity-tuned; about 3,000 shoppers/minute is an initial target that must be validated with load tests.
- **Layer 7 Load Balancer and Rate Limiter:** Distributes inbound traffic across stateless application nodes, enforces TLS termination, and applies per-account and per-IP limits with counters in Redis. Excess requests receive `429 Too Many Requests`.
- **Stateless App Servers (Auto-scaling Group):** Containerized API instances handle business logic, authentication, and database transactions. They scale horizontally and are pre-scaled before a sale because reactive autoscaling may lag a short spike.
- **Redis Cluster:** High-speed in-memory store that holds:
  1. Real-time seat availability bitmaps for sub-millisecond seating map queries.
  2. API rate-limit counters, session references, and queue/admission tokens.
- Redis seat maps and sold-out markers are caches only. PostgreSQL verifies every hold and purchase; cache entries are refreshed or invalidated from committed database changes.
- **Primary Database (PostgreSQL):** The authoritative single source of truth for all transactional writes. Executes `SELECT ... FOR UPDATE` row locks to guarantee zero double-booking.
- **Read Replicas (PostgreSQL):** Read-only clones handle event/catalog queries and non-sensitive browsing. Ticket and order reads immediately after checkout use the primary or a read-your-writes path to avoid replication lag.
- **Message Queue & Background Workers:** Decouples confirmation emails, payment-webhook reconciliation, and expired-hold cleanup from user requests. Ticket records and unique codes are committed with the paid order; the email is sent asynchronously.
- **Payment Gateway (Stripe):** Handles PCI-compliant financial transactions asynchronously using idempotency tokens.
- **Monitoring:** Alerts on request/error rates, latency, queue length, hold conflicts, payment reconciliation backlog, and database health.

---

### How the Architecture Survives the Big Sale

1. **Virtual Queue Protects the Database:**
   Attempting to process 200,000 users all clicking "Hold" simultaneously would risk database connection exhaustion and severe row contention. The virtual waiting room meters entry to measured database capacity; the initial target is about 3,000 shoppers/minute and is adjusted using load-test results and live health signals.
2. **Read/Write Segregation:**
   Users refreshing the seating map read from Redis in-memory cache or PostgreSQL read replicas. The primary database processes holds, payment state transitions, and final purchases.
3. **Short Transaction Boundaries:**
   Database transactions hold row locks only for the few milliseconds required to validate and toggle the seat row to `HELD`. Payment processing (which takes 2–3 seconds) is done **outside** the database transaction, referencing the acquired `hold_token`. This keeps lock times microscopic and prevents connection starvation.
4. **Graceful Sold-Out Transition:**
   A cached sold-out flag can stop unnecessary traffic once all seats are held or sold, but it is only an optimization. The primary database still makes the final inventory decision, and the flag is refreshed when holds expire or seats are released.

---

## 7. Trade-offs

### Trade-off 1: Virtual Waiting Room vs. Open Real-Time Free-for-All
- **Choice:** Implement a virtual queue (waiting room) that meters users into the ticketing flow during high-demand events.
- **Pros:** Guarantees platform survival, eliminates server crashes, prevents database connection pool exhaustion, and provides a predictable, fair ordering for fans.
- **Cons:** Introduces friction into the user experience. Users who click right at 10:00 AM are placed in a queue rather than directly checking out, and frustrated users may complain on social media about "waiting in line".
- **Verdict:** Essential. A waiting room with an informative progress bar is vastly superior to a crashed website displaying `502 Bad Gateway` errors.

---

### Trade-off 2: Pessimistic Row Locking vs. Optimistic Locking
- **Choice:** Use pessimistic database row locking (`SELECT ... FOR UPDATE`) during seat reservation.
- **Pros:** Under hyper-contention (10 users attempting to hold the same seat in the same millisecond), pessimistic locking queues requests cleanly on the row lock; the first wins and the subsequent 9 fail cleanly with a clear status.
- **Cons:** Acquiring row locks consumes database transaction threads. If a transaction hangs or deadlocks, other requests wait until timeout.
- **Alternative Considered (Optimistic Locking with version column):** Optimistic locking (`UPDATE seats SET status = 'HELD' WHERE id = :id AND version = :v`) avoids locks, but under 10:1 contention, 90% of requests fail with serialization conflicts and must be retried repeatedly, wasting CPU cycles and database bandwidth.
- **Verdict:** Pessimistic locking paired with sub-second transaction limits and virtual queuing provides the most predictable and rock-solid consistency.

---

### Trade-off 3: 10-Minute Seat Hold Window vs. Shorter (3-Minute) Hold
- **Choice:** Provide users with a 10-minute hold window to complete checkout.
- **Pros:** Gives customers adequate time to review seat selections, log in, enter billing addresses, verify credit card SMS 2-factor authentication, and resolve payment errors without losing their seats.
- **Cons:** If 20,000 seats are held by users who ultimately decide not to buy, those seats remain locked out of inventory for 10 full minutes while eager fans wait in queue.
- **Verdict:** 10 minutes balances security and customer conversion. To minimize hoarding, users are limited to holding a maximum of 4 seats per account.

## 8. Alternatives considered

| Alternative | Why it was not chosen |
|---|---|
| Check then write in application code | A separate `SELECT` and `UPDATE` creates a race window; the conditional transaction must be the inventory referee. |
| Locks kept in app-server memory | Each app server has separate memory, so a lock on one instance cannot protect another. |
| Seat locks only in Redis | Redis and PostgreSQL could disagree after a failure. PostgreSQL remains the source of truth for inventory. |
| Document (NoSQL) database | Users, orders, seats, and tickets are relational, and correctness depends on transactions and unique constraints. |
| Automatic "best available" seats only | It reduces seat-selection conflicts but removes user choice. It may be offered as an optional flow. |
| Autoscaling without a waiting room | New servers take time to start, and extra app servers do not remove the primary database's write limit. |

## 9. Risks and open questions

### Risks and mitigations
- **Bots create multiple accounts to get more queue places:** require verified accounts, rate-limit queue entry, use CAPTCHA when risk signals warrant it, and monitor suspicious patterns.
- **Payment provider is slow or unavailable:** keep the order in a recoverable `PAYING` state, reconcile via idempotent retries and webhooks, and extend the hold only for a bounded period.
- **Payment succeeds but the application loses its connection before confirmation:** process the provider webhook idempotently; if the order cannot be finalized safely, reconcile and refund.
- **Primary database fails during a sale:** pause holds and payments until safe failover; let the waiting room retain users rather than accept uncertain writes.
- **Cache or waiting room is misconfigured:** run load tests for the expected peak (up to 15,000 requests/s) and test sold-out, expiry, provider-timeout, and failover paths before launch.

### Open questions
- Should high-demand events use the 10-minute hold window or a shorter window?
- Should "best available" be offered as a default option during a Big Sale?
- Which payment methods are required, and do they support idempotency keys and webhooks?
- What refund and cancellation policy applies if an event is cancelled?
- Should event organisers configure the per-user ticket limit, or should the limit remain fixed?
