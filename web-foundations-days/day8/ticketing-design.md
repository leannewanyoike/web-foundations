# Day 8 Assignment: TicketHub System Design

TicketHub is a high-scale online ticketing platform that sells reserved-seat tickets for concerts, sporting events, and theater productions. The platform handles everyday browsing and sales while reliably surviving massive traffic surges when high-demand concert tours go on sale.

---

## 1. Requirements

### Functional Requirements
1. **Browse and Search Events:** Users can browse, search, and view event details (performers, venue, date, seating layout, and pricing tiers).
2. **Interactive Seating Map:** Users can view real-time seat availability for an event (`available`, `held`, `sold`).
3. **Seat Reservation (Hold):** A user can select and temporarily hold up to 4 available seats for 10 minutes while completing checkout.
4. **Secure Checkout & Payment:** Users can pay for held seats using a credit card or third-party payment gateway. Upon successful payment, the seats transition to `sold` and an order confirmation is created.
5. **View and Access Tickets:** Users can view purchased tickets, order history, and access scannable QR/barcodes for venue entry.
6. **Automatic Hold Expiration:** If the 10-minute hold window lapses without payment completion, held seats are automatically released back to the `available` pool.

### Non-Functional Requirements
- **Correctness (Zero Double-Booking):** Under no circumstance may two different users purchase or hold the exact same seat. Strict serializability/isolation is non-negotiable for inventory state changes.
- **Speed & Latency:**
  - Event browsing and seating chart rendering must return in `< 150 ms`.
  - Hold and checkout operations must complete in `< 500 ms`.
- **Fairness:**
  - First-come, first-served semantics during high-demand drops.
  - Virtual queueing and rate-limiting to prevent bot scalping, automated seat hoovering, and denial-of-service degradation.
- **High Availability & Fault Tolerance:**
  - 99.95% uptime. The system must degrade gracefully during flash crowds (e.g., queuing rather than crashing).
  - External payment gateway outages must not corrupt seat state or leak inventory.

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
   All 200,000 users attempt to hold seats as fast as possible.
   Hold attempts in first 60s:  ≈ 100,000 attempts ÷ 60 s ≈ 1,666 hold attempts / second
   Actual inventory capacity:   20,000 seats held in ~120 seconds
   Successful write rate:       20,000 ÷ 120 s ≈ 167 successful holds / second
```

---

### C. Normal vs. Big Sale Comparison

| Metric | Normal Day | Big Sale Peak (10 min) | Factor Increase |
|---|---|---|---|
| **Active Users / Period** | 50,000 / 24 hours | 200,000 / 10 minutes | **~576× rate** |
| **Read Throughput** | ~17 RPS (avg) / 50 RPS (peak) | 5,000 RPS (avg) / 15,000 RPS (peak) | **~300× – 500×** |
| **Write / Hold Throughput** | ~0.06 writes / second | ~1,666 attempts / second | **~28,000×** |
| **Row Contention** | Near zero (spread across events) | Extreme (200k users targeting 20k rows) | **Massive contention** |

**Key Takeaway:** A standard database easily handles normal traffic (17 RPS and 0.06 writes/s). However, during a Big Sale, unfiltered traffic would immediately saturate database connection pools and cause deadlocks. The system requires an edge waiting room to throttle traffic, read caching for event maps, and atomic row-level reservation mechanisms.

---

## 3. API Design

All endpoints communicate over HTTPS with JSON request/response bodies and utilize standard HTTP status codes.

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

### 2. `GET /api/v1/events/:id/seats`
Retrieve the seating chart and live seat statuses for an event.
- **Headers:** `Authorization: Bearer <token>`
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

### 3. `POST /api/v1/events/:id/holds`
Attempt to place a temporary 10-minute hold on selected seats.
- **Headers:** `Authorization: Bearer <token>`, `Idempotency-Key: <uuid>`
- **Request Body:**
```json
{
  "seat_ids": ["st_101", "st_104"]
}
```
- **Response `201 Created`:**
```json
{
  "hold_token": "hld_4a9b2c3d",
  "seat_ids": ["st_101", "st_104"],
  "expires_at": "2026-10-28T22:10:00Z",
  "ttl_seconds": 600
}
```
- **Error Responses:**
  - `409 Conflict`: `{"error": "SEATS_UNAVAILABLE", "message": "One or more selected seats are already held or sold."}`
  - `429 Too Many Requests`: `{"error": "RATE_LIMITED", "message": "Queue token required."}`

---

### 4. `POST /api/v1/orders/checkout`
Submit payment and complete the purchase for held seats.
- **Headers:** `Authorization: Bearer <token>`, `Idempotency-Key: <uuid>`
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

### 5. `GET /api/v1/users/me/tickets`
View confirmed tickets and barcodes for the authenticated user.
- **Headers:** `Authorization: Bearer <token>`
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

The relational schema is implemented in PostgreSQL to provide strict ACID guarantees, foreign key constraints, and transactional row locking.

```
       ┌────────────────────────┐
       │         users          │
       ├────────────────────────┤
       │ id (PK)                │◄─────────┐
       │ email (UQ)             │          │
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
       │ payment_ref            │          │
       │ created_at             │          │
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
       │ seat_id (FK, UQ)       │   │ start_time             │
       │ price_cents            │   │ total_seats            │
       │ qr_code_hash           │   │ created_at             │
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
       │ hold_token (nullable)                               │
       │ hold_expires_at (nullable)                          │
       │ version (INT, optimistic locking)                   │
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
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    total_seats INT NOT NULL,
    status VARCHAR(50) DEFAULT 'SCHEDULED',
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
    hold_token VARCHAR(64) NULL,
    hold_expires_at TIMESTAMP WITH TIME ZONE NULL,
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_event_seat UNIQUE (event_id, section, row, seat_number)
);

CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_seats_hold_expiry ON seats(hold_expires_at) WHERE status = 'HELD';
```

#### 4. `orders` & `order_items`
Represents completed financial transactions and assigned tickets.
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    event_id UUID NOT NULL REFERENCES events(id),
    total_amount_cents INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
    payment_ref VARCHAR(100) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_id UUID UNIQUE NOT NULL REFERENCES seats(id), -- Critical: UNIQUE prevents double-booking
    price_cents INT NOT NULL,
    qr_code_hash VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 5. Preventing Double-Booking: Transactions and Constraints

Double-booking occurs when two concurrent requests read seat status as `AVAILABLE` and both write reservations. TicketHub prevents double-booking through three defense layers:

### Layer 1: Atomic Database Hold with Pessimistic Row Locking
When a user requests to hold seats, the application executes a single transaction utilizing `SELECT ... FOR UPDATE`:

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- 1. Lock the candidate rows immediately
SELECT id, status, hold_expires_at 
FROM seats 
WHERE id IN ('st_101', 'st_102') 
  AND event_id = 'evt_987'
FOR UPDATE;

-- 2. Verify all requested seats are truly available or expired
-- If any seat is SOLD, or HELD with hold_expires_at > NOW(), abort:
-- (Application inspects result; if any seat is unavailable, ROLLBACK and return 409)

-- 3. Transition status to HELD with a 10-minute lease
UPDATE seats 
SET status = 'HELD',
    hold_token = 'hld_4a9b2c3d',
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    version = version + 1
WHERE id IN ('st_101', 'st_102');

COMMIT;
```

**Why this works:** `SELECT ... FOR UPDATE` acquires row-level exclusive locks in Postgres. If User B attempts to hold the same seat 2 milliseconds later, User B's transaction blocks until User A's transaction commits. Once User A commits, User B reads `status = 'HELD'` and is immediately rejected with `409 Conflict`.

---

### Layer 2: Final Checkout Atomic State Transition
When the user submits payment, the system verifies the hold token and transitions the seat to `SOLD`:

```sql
BEGIN;

-- Atomically verify hold token and lock seat
SELECT id FROM seats 
WHERE id IN ('st_101', 'st_102')
  AND status = 'HELD' 
  AND hold_token = 'hld_4a9b2c3d'
  AND hold_expires_at > NOW()
FOR UPDATE;

-- Charge payment gateway via idempotency key...
-- If payment succeeds:
UPDATE seats 
SET status = 'SOLD', 
    hold_token = NULL, 
    hold_expires_at = NULL 
WHERE id IN ('st_101', 'st_102');

INSERT INTO orders (id, user_id, event_id, total_amount_cents, status, payment_ref)
VALUES ('ord_88129', 'usr_55', 'evt_987', 24000, 'PAID', 'ch_stripe_999');

INSERT INTO order_items (order_id, seat_id, price_cents, qr_code_hash)
VALUES ('ord_88129', 'st_101', 12000, 'hash_1'),
       ('ord_88129', 'st_102', 12000, 'hash_2');

COMMIT;
```

---

### Layer 3: Database-Level UNIQUE Constraint Safety Net
Even in the event of an unforeseen application bug, race condition, or faulty cache layer, the table schema contains an unbreakable constraint:
```sql
CONSTRAINT uq_order_items_seat_id UNIQUE (seat_id)
```
Because `order_items.seat_id` is strictly `UNIQUE`, the database engine will physically throw an integrity violation error if any process ever tries to insert a duplicate ticket for a seat.

---

### Handling Abandoned Holds (Deadlock & Expiry Prevention)
1. **Lazy Expiration:** Any query attempting to hold a seat treats a seat as `AVAILABLE` if `status = 'HELD' AND hold_expires_at < NOW()`.
2. **Active Sweeper:** A lightweight worker process runs every 30 seconds to clean up expired holds:
   ```sql
   UPDATE seats 
   SET status = 'AVAILABLE', hold_token = NULL, hold_expires_at = NULL 
   WHERE status = 'HELD' AND hold_expires_at < NOW();
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
                                         │ Admitted traffic (500 users/min)
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

- **Cloudflare CDN & Edge Caching:** Caches static web assets, venue floor plans, and non-sensitive event descriptions at edge servers worldwide, absorbing 95% of read requests without hitting our backend.
- **Virtual Waiting Room (Traffic Shaping):** During the Big Sale, when 200,000 users arrive simultaneously, the waiting room intercepts requests before they hit the origin servers. It assigns each user a cryptographically signed queue number and only admits a controlled batch (e.g., 500 users every 30 seconds) into the purchasing flow.
- **Layer 7 Load Balancer:** Distributes inbound traffic evenly across stateless application nodes, enforces TLS termination, and drops abusive traffic or automated bot scrapers.
- **Stateless App Servers (Auto-scaling Group):** Containerized API instances that handle business logic, authenticate requests, and orchestrate database transactions. They scale horizontally from 5 instances to 50 instances based on CPU and request latency metrics.
- **Redis Cluster:** High-speed in-memory store that holds:
  1. Real-time seat availability bitmaps for sub-millisecond seating map queries.
  2. Temporary hold keys with native Redis TTLs (`EXPIRE 600`).
  3. API rate limits and waiting room verification cookies.
- **Primary Database (PostgreSQL):** The authoritative single source of truth for all transactional writes. Executes `SELECT ... FOR UPDATE` row locks to guarantee zero double-booking.
- **Read Replicas (PostgreSQL):** Two or more read-only clones that handle catalog searches, past order views, and general queries, keeping the primary instance dedicated exclusively to ticket hold and purchase transactions.
- **Message Queue & Background Workers:** Decouples slow, non-critical post-purchase tasks (rendering PDF tickets, generating QR codes, sending confirmation emails, and sweeping expired holds) so the checkout API responds instantly.
- **Payment Gateway (Stripe):** Handles PCI-compliant financial transactions asynchronously using idempotency tokens.

---

### How the Architecture Survives the Big Sale

1. **Virtual Queue Protects the Database:**
   Attempting to process 200,000 users all clicking "Hold" simultaneously would require thousands of database connections, triggering connection pool exhaustion and database collapse. The virtual waiting room meters entry to exactly match database transaction capacity (e.g., 200–300 checkout attempts per second).
2. **Read/Write Segregation:**
   Users refreshing the seating map read from Redis in-memory cache or PostgreSQL read replicas. The primary database only processes actual hold and payment transactions.
3. **Short Transaction Boundaries:**
   Database transactions hold row locks only for the few milliseconds required to validate and toggle the seat row to `HELD`. Payment processing (which takes 2–3 seconds) is done **outside** the database transaction, referencing the acquired `hold_token`. This keeps lock times microscopic and prevents connection starvation.
4. **Graceful Sold-Out Transition:**
   Once all 20,000 seats are marked `HELD` or `SOLD`, Redis immediately sets an `event:evt_987:sold_out = true` flag. The app servers inspect this flag and instantly reject subsequent hold requests at the application tier in 2 ms without querying PostgreSQL.

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
