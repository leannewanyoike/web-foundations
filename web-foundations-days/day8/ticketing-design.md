# TicketHub – System Design Document

**Author:** leannewanyoike  **Course:** Web Foundations – Day 8  **Status:** Final

---

## 0. Context, goals and non-goals

**Context.** TicketHub is a website that sells tickets for concerts and events. Fans browse upcoming events, choose seats on a seat map, pay, and receive tickets they can show at the door. Most days are quiet, but when a very popular concert goes on sale, hundreds of thousands of people arrive at the same moment to compete for a limited number of seats.

**Goals**

- Never sell the same seat to two people.
- Stay online and responsive during a "big sale", even when demand is ten times the supply.
- Treat buyers fairly: the fastest bot or the person who refreshes most should not win.
- Keep normal browsing fast and simple.

**Non-goals** (deliberately out of scope, to keep the project manageable)

- Ticket resale or transfers between fans.
- Self-service refunds and exchanges (handled manually by support staff).
- A full admin portal for event organisers (events are added by staff).
- Recommendations, reviews or social features.
- Native mobile apps (the website is responsive and works on phones).

---

## 1. Requirements

### Functional requirements

1. Users can register, log in and log out.
2. Anyone can browse and search events by name, city and date.
3. Anyone can view an event's details and its seat map, showing which seats are available.
4. A logged-in user can **hold** up to 4 seats for an event. A hold reserves the seats for **10 minutes** while the user pays.
5. A user can release a hold early (cancel).
6. A user can pay for held seats; on success, the order is confirmed and tickets are issued.
7. A user can view their orders and tickets (each ticket has a unique code shown as a QR code).
8. Users receive a confirmation email after paying.
9. During a big sale, users enter a **waiting room** and are let into the purchase flow in a fair order.

### Non-functional requirements

| Category | Requirement |
|---|---|
| **Correctness** | A seat is sold at most once – zero double-bookings, ever. A user is never charged twice for the same order. |
| **Fairness** | During a big sale, people who arrive before sales open are placed in a random order; later arrivals are queued first-come, first-served. Limit of 4 tickets per user per event. Rate limits and one queue place per account reduce the advantage of bots. |
| **Speed** | Event pages load in under 1 second. A hold request responds in under 500 ms, so users quickly learn whether they got their seats. |
| **Availability** | 99.9% availability normally. During a big sale, the site must slow down gracefully (people wait in the queue) rather than crash. |
| **Scalability** | Handle short bursts of several thousand times normal traffic. |
| **Security** | HTTPS everywhere; passwords stored only as hashes; card details are never stored by TicketHub (handled by the payment provider). |

**Correctness beats availability for purchases:** if the database cannot confirm a seat safely, TicketHub refuses the sale rather than risk selling the seat twice. Browsing can still work from the cache.

---

## 2. Estimates

As in the course, I use **1 day ≈ 100,000 seconds** to keep the arithmetic simple.

### Normal day

| Quantity | Calculation | Result |
|---|---|---|
| Page views | 50,000 visitors × 10 pages | 500,000 per day |
| Average reads | 500,000 ÷ 100,000 s | **≈ 5 requests/s** |
| Peak reads (busy evening, ×5) | 5 × 5 | ≈ 25 requests/s |
| Tickets sold | 5,000 per day ÷ 100,000 s | **≈ 0.05 writes/s** (one ticket every ~20 s) |
| Read : write ratio | 500,000 : 5,000 | ≈ 100 : 1 (read-heavy) |

**Storage (per year)**

- Users: 2,000,000 × ~1 KB ≈ **2 GB** (grows slowly).
- Tickets: 5,000/day × 365 ≈ 1.8 million × ~0.5 KB ≈ **1 GB per year**.
- Seats: if there are ~1,000 events a year with ~5,000 seats each, that is 5 million rows × ~100 bytes ≈ **0.5 GB per year**.
- Event images go to object storage, not the database.

Conclusion: on a normal day, **one app server and one database would be enough**.

### Big sale (one popular concert goes on sale)

Facts: 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds).

| Quantity | Calculation | Result |
|---|---|---|
| Arrivals | 200,000 ÷ 600 s | ≈ 330 new people/s on average |
| Arrivals in the first minute (assume half arrive at once) | 100,000 ÷ 60 s | ≈ **1,700 new people/s** |
| Requests per person (event page, seat map refreshes, hold attempts, payment) | assume ~10 | 2,000,000 requests in 10 min |
| Average request rate | 2,000,000 ÷ 600 s | **≈ 3,300 requests/s** |
| First-minute peak (everyone refreshing) | assume ~5× average | **≈ 15,000 requests/s** |
| Hold attempts (most people try at least twice) | 200,000 × 2 = 400,000 ÷ 600 s | **≈ 700 writes/s**, all aimed at the same 20,000 seat rows |
| Demand vs supply | 200,000 people ÷ 20,000 seats | **10 people for every seat** |
| Successful payments (avg. 2 seats per order) | 10,000 orders in ~10 min | ≈ 17 payments/s |

### Comparing the two

| | Normal day | Big sale | Increase |
|---|---|---|---|
| Requests per second | ~5 (25 peak) | ~3,300 (15,000 peak) | **≈ 600–700× more** |
| Writes per second | ~0.05 | ~700 | **≈ 14,000× more** |
| Duration | Spread over 24 hours | Concentrated in 10 minutes | – |
| Main pressure | Reads (browsing) | **Writes competing for the same rows** | – |

**What the numbers tell us:**

1. The design is driven entirely by the big sale. Normal traffic is tiny.
2. Unlike the URL shortener (which was read-heavy and solved mainly with a cache), the hard problem here is **contention**: thousands of people trying to change the same few rows at the same time. A cache cannot solve that, because writes must go to the one place that knows the truth.
3. 180,000 people will leave without tickets. The system must tell them **quickly and fairly**, not leave them staring at error pages.
4. If a waiting room admits only about **3,000 shoppers per minute**, the database sees roughly 100–200 hold transactions per second, which a single well-indexed relational database handles comfortably. The waiting room turns an impossible spike into a steady, manageable flow.

---

## 3. API

All endpoints are under `https://tickethub.example/api`. Requests and responses use JSON. Endpoints marked 🔒 require a logged-in user (session cookie or token).

| # | Method & path | Purpose | Success | Errors |
|---|---|---|---|---|
| 1 | `GET /events?q=&city=&date=` | Browse and search events | 200 OK | 400 bad filter |
| 2 | `GET /events/{eventId}` | Event details | 200 OK | 404 Not Found |
| 3 | `GET /events/{eventId}/seats` | Seat map with availability | 200 OK | 404 |
| 4 | `POST /events/{eventId}/queue` 🔒 | Join the waiting room (big sales) | 202 Accepted | 409 already queued |
| 5 | `GET /queue/{queueToken}` 🔒 | Check queue position / get admitted | 200 OK | 404 |
| 6 | `POST /events/{eventId}/holds` 🔒 | Hold seats for 10 minutes | 201 Created | 409 Conflict, 422, 429 |
| 7 | `DELETE /holds/{orderId}` 🔒 | Release a hold early | 204 No Content | 404, 409 already paid |
| 8 | `POST /holds/{orderId}/payment` 🔒 | Pay and confirm the order | 201 Created | 402, 409, 410 Gone |
| 9 | `GET /me/orders` 🔒 | List my orders | 200 OK | 401 |
| 10 | `GET /me/tickets` 🔒 | List my tickets (with codes) | 200 OK | 401 |

Registration and login (`POST /users`, `POST /sessions`) work exactly as in QuickNotes and are not repeated here.

### Examples

**3. View seats** – `GET /events/42/seats`

```json
200 OK
{
  "eventId": 42,
  "updatedAt": "2026-11-20T09:00:02Z",
  "seats": [
    { "id": 1001, "section": "A", "row": "1", "number": 1, "priceCents": 450000, "status": "available" },
    { "id": 1002, "section": "A", "row": "1", "number": 2, "priceCents": 450000, "status": "held" },
    { "id": 1003, "section": "A", "row": "1", "number": 3, "priceCents": 450000, "status": "sold" }
  ]
}
```

`updatedAt` shows that this map may be up to ~2 seconds old (it comes from the cache – see trade-off 2).

**6. Hold seats** – `POST /events/42/holds`

```json
Request:  { "seatIds": [1001, 1004] }

201 Created
{
  "orderId": 9876,
  "status": "held",
  "seatIds": [1001, 1004],
  "totalCents": 900000,
  "expiresAt": "2026-11-20T09:12:00Z"
}
```

Error responses:

- `409 Conflict` – `{ "error": "SEAT_UNAVAILABLE", "unavailableSeatIds": [1004] }` – someone else got there first. Nothing is held (all or nothing).
- `422 Unprocessable Entity` – more than 4 seats, or the user would exceed 4 tickets for this event.
- `429 Too Many Requests` – the user is sending requests too quickly.
- `403 Forbidden` – during a big sale, the user has not been admitted from the waiting room yet.

**8. Pay** – `POST /holds/9876/payment`

```
Headers: Idempotency-Key: 5b1e0c2a-7f1d-4c4e-9a51-2f0f3d1a8e77
```

```json
Request:  { "paymentToken": "tok_from_payment_provider" }

201 Created
{
  "orderId": 9876,
  "status": "paid",
  "tickets": [
    { "ticketId": 55501, "seatId": 1001, "code": "TH-7Q2M-91XK" },
    { "ticketId": 55502, "seatId": 1004, "code": "TH-3PZ8-44LD" }
  ]
}
```

Error responses:

- `402 Payment Required` – the card was declined; the hold stays active until it expires so the user can try another card.
- `410 Gone` – the hold expired before payment started; the seats were released.
- `409 Conflict` – the order is already paid or cancelled.

The **Idempotency-Key** header means that if the user double-clicks "Pay" or the network retries the request, the server recognises the same key and returns the first result instead of charging again.

---

## 4. Data model

Five tables: **users**, **events**, **seats**, **orders** and **tickets**. A *hold* is simply an order with the status `held`.

```sql
CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  venue                 TEXT NOT NULL,
  city                  TEXT NOT NULL,
  starts_at             TIMESTAMP NOT NULL,
  on_sale_at            TIMESTAMP NOT NULL,
  max_tickets_per_user  INTEGER NOT NULL DEFAULT 4 CHECK (max_tickets_per_user > 0),
  image_url             TEXT,                  -- file lives in object storage
  status                TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'on_sale', 'sold_out', 'cancelled', 'finished'))
);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  event_id         INTEGER NOT NULL REFERENCES events(id),
  status           TEXT NOT NULL
                   CHECK (status IN ('held', 'paying', 'paid', 'expired', 'cancelled', 'refunded')),
  total_cents      INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  expires_at       TIMESTAMP NOT NULL,         -- when the hold ends
  idempotency_key  TEXT UNIQUE,                -- prevents paying twice
  payment_ref      TEXT UNIQUE,                -- id returned by the payment provider
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at          TIMESTAMP
);

CREATE TABLE seats (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  section      TEXT NOT NULL,
  row_label    TEXT NOT NULL,
  seat_number  INTEGER NOT NULL,
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  status       TEXT NOT NULL DEFAULT 'available'
               CHECK (status IN ('available', 'held', 'sold')),
  order_id     INTEGER REFERENCES orders(id),  -- the order holding or owning the seat
  held_until   TIMESTAMP,
  UNIQUE (event_id, section, row_label, seat_number),   -- no duplicate seats in a venue
  CHECK ((status = 'available' AND order_id IS NULL)
      OR (status <> 'available' AND order_id IS NOT NULL))
);

CREATE TABLE tickets (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  seat_id    INTEGER NOT NULL UNIQUE REFERENCES seats(id),  -- one seat → at most ONE ticket, ever
  code       TEXT NOT NULL UNIQUE,                         -- shown as a QR code at the door
  issued_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for the most common queries
CREATE INDEX idx_events_starts_at   ON events (starts_at);
CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_seats_order        ON seats (order_id);
CREATE INDEX idx_orders_user        ON orders (user_id);
CREATE INDEX idx_tickets_order      ON tickets (order_id);
```

### Relationships

```
users  1 ──< N  orders          a user places many orders
events 1 ──< N  orders          each order is for one event
events 1 ──< N  seats           each event has its own seats (prices and status differ per event)
orders 1 ──< N  seats           an order holds/owns up to 4 seats
orders 1 ──< N  tickets         a paid order produces one ticket per seat
seats  1 ──  0..1 tickets       a seat has at most one ticket (UNIQUE seat_id)
```

### Design notes

- **Seats belong to an event, not just a venue.** The same physical seat has a different price and status at every concert, so each event gets its own seat rows (created when the event is added).
- **Money is stored in cents as INTEGER** to avoid rounding errors with decimals.
- **CHECK constraints** keep statuses to known values and stop impossible states, such as an "available" seat that still belongs to an order.
- **UNIQUE constraints do the important safety work:** no duplicate seats per event, no seat on two tickets, no payment recorded twice.

---

## 5. Architecture

### Diagram

```
                       Users (browsers and phones)
                                   |
                                   v
          +------------------------------------------------+
          |  CDN: HTML/CSS/JS, event images, cached event  |
          |  pages (served from servers close to users)    |
          +------------------------------------------------+
                                   | API calls
                                   v
          +------------------------------------------------+       +-------------------------+
          |  Waiting room (switched on for big sales only) |<----->|  Redis                  |
          +------------------------------------------------+       |  - queue positions      |
                                   | admitted users only           |  - seat-map cache       |
                                   v                               |  - rate-limit counters  |
          +------------------------------------------------+       +-------------------------+
          |  Load balancer + rate limiter                  |                    ^
          +------------------------------------------------+                    |
                 |                  |                  |                        |
                 v                  v                  v                        |
          +-------------+    +-------------+    +-------------+                 |
          | App server  |    | App server  |    | App server  |-----------------+
          | (stateless) |    | (stateless) |    | (stateless) |
          +-------------+    +-------------+    +-------------+
                 |                                     |            |              |
                 | reads (browse,                      | writes     | payments     | background
                 | my tickets)                         | (holds,    |              | jobs
                 v                                     v  orders)   v              v
          +---------------+  replication  +---------------------+  +-----------+  +--------------+
          | Read replicas |<--------------| Primary database    |  | Payment   |  | Job queue    |
          +---------------+               | (source of truth)   |  | provider  |  | + workers    |
                                          +---------------------+  | (external)|  +--------------+
                                                     ^             +-----------+    | expire holds
                                                     |                              | send emails
                                                     +------------------------------+ issue refunds

          Object storage: event images and posters (delivered to users through the CDN)
          Monitoring: request rate, error rate, latency, queue length, hold conflicts, DB load
```

### Components – each one justified by a problem

Following the course method, I started with **one app server and one database**, then asked "where does this break?" using the big-sale numbers.

| Component | Problem it solves | Notes |
|---|---|---|
| **CDN** | 15,000 requests/s at peak, most of them for the same pages, images and scripts. | Static files and event pages are served from servers near users and never touch our app servers. |
| **Object storage** | Event images are large files that would bloat the database. | The database stores only the image URL. |
| **Waiting room** | 200,000 people arriving at once would overwhelm everything behind it, and "whoever clicks fastest wins" is unfair. | Users get a queue token and a position. People who arrive before sales open are shuffled randomly; later arrivals join the back. Users are admitted at a controlled rate (≈3,000/min) and get a short-lived "admitted" pass. |
| **Load balancer** | One app server cannot handle thousands of requests/s and would be a single point of failure. | Spreads traffic over many servers and removes unhealthy ones. |
| **Rate limiter** | Bots and frantic refreshing can flood the API. | Per-user and per-IP limits stored in Redis; excess requests get `429 Too Many Requests`. |
| **Stateless app servers** | Need to add servers quickly for a big sale. | No session data kept in server memory (it is in a signed cookie/Redis), so any server can handle any request. Extra servers are started **before** the sale opens, because autoscaling reacts too slowly to a spike that lasts minutes. |
| **Redis cache** | Thousands of people refreshing the seat map would each run a query on 20,000 seat rows. | The seat map for each event is rebuilt every 1–2 seconds and served from memory. Event details are cached for longer, since they rarely change. |
| **Primary database (relational, e.g. PostgreSQL)** | Holds and payments must be correct; we need transactions and constraints. | All writes go here. It is the **only source of truth** for who owns which seat. |
| **Read replicas** | Browsing and "my tickets" requests would compete with sale writes on the primary. | Replicas handle reads; one can be promoted if the primary fails. |
| **Payment provider (external)** | Handling card numbers ourselves is risky and heavily regulated. | We store only a token and a payment reference. |
| **Job queue + workers** | Slow or scheduled tasks should not slow down user requests. | Workers release expired holds, send confirmation emails, process payment webhooks and issue automatic refunds. |
| **Monitoring** | We need to know immediately if the sale is going wrong. | Alerts on error rate, latency, database load, queue length and hold-conflict rate. |

### How the design survives the big sale

1. **Before the sale:** extra app servers are started, the event page and seat map are pre-loaded into the CDN and cache, and the waiting room is switched on for this event.
2. **At opening time:** 200,000 people hit the CDN and waiting room – both are built for huge read traffic and do very little work per request. Nobody reaches the database yet.
3. **Admission:** the waiting room lets in about 3,000 people per minute. Each admitted user has a 10-minute window to choose seats.
4. **Choosing seats:** the seat map comes from the cache (1–2 s old). Hold requests go to the primary database, which now sees only a few hundred transactions per second instead of thousands.
5. **Conflicts:** if two people pick the same seat, one gets it and the other gets `409` within milliseconds and chooses again (see section 6).
6. **Sold out:** as soon as no seats remain available or held, the event is marked `sold_out`, the waiting room tells everyone still queuing, and they leave immediately instead of waiting for nothing. If holds expire, the remaining queue is admitted again.
7. **If something fails:** browsing continues from the CDN and cache. If the primary database is unavailable, holds and payments are paused (correctness over availability) and the waiting room simply holds people until it recovers.

---

## 6. Preventing double-booking

### The problem: a race condition

Alice and Bob both see seat A-1-1 as available. They click "Hold" at the same moment, and their requests land on two different app servers. A naive design does this:

```
1. SELECT status FROM seats WHERE id = 1001;   -- both see 'available'
2. UPDATE seats SET status = 'held' ...;       -- both update → both think they got it
```

Between step 1 and step 2, the other person can sneak in. Locking inside one app server does not help, because there are many servers. The **database** must be the referee.

### Layer 1 – An atomic "check-and-change" inside a transaction

Instead of checking first and then writing, the check is **part of the write itself**. The database checks the condition and changes the row in one indivisible step:

```sql
BEGIN;

-- 1. Create the hold (an order with status 'held')
INSERT INTO orders (user_id, event_id, status, expires_at)
VALUES (:userId, :eventId, 'held', CURRENT_TIMESTAMP + INTERVAL '10 minutes')
RETURNING id;                                    -- → :orderId

-- 2. Claim the seats ONLY if they are still free
UPDATE seats
SET    status = 'held',
       order_id = :orderId,
       held_until = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
WHERE  event_id = :eventId
  AND  id IN (:seat1, :seat2)
  AND  (status = 'available'
        OR (status = 'held' AND held_until < CURRENT_TIMESTAMP));  -- an expired hold counts as free

-- 3. The app checks how many rows were updated.
--    If it is fewer than the seats requested → ROLLBACK and return 409 Conflict.
--    (All or nothing: the user never ends up with only some of the seats.)

UPDATE orders
SET    total_cents = (SELECT SUM(price_cents) FROM seats WHERE order_id = :orderId)
WHERE  id = :orderId;

COMMIT;
```

**Why this is safe:** when Alice's `UPDATE` touches seat 1001, the database **locks that row** until her transaction finishes. Bob's `UPDATE` has to wait. When Alice commits, Bob's update re-checks the `WHERE` condition against the new row, sees `status = 'held'`, updates **0 rows**, and Bob receives `409 Conflict`. Exactly one person wins, no matter how many servers are involved.

**Isolation level.** PostgreSQL's default isolation level, **READ COMMITTED**, is enough here, as long as the availability check stays *inside* the `UPDATE ... WHERE` and is never done as a separate `SELECT` first. Under READ COMMITTED, a blocked `UPDATE` re-evaluates its `WHERE` clause against the newly committed row version before changing it, which is exactly the behaviour described above. Stricter levels (REPEATABLE READ or SERIALIZABLE) would also be correct, but under heavy contention they abort many transactions with serialization errors that the app would have to retry, adding load at the worst possible moment. So the rule for developers is: **never decide availability with a plain `SELECT` and then write**. If a seat must be read before it is changed, read it with `SELECT ... FOR UPDATE` so the row is locked for the rest of the transaction.

**Avoiding deadlocks.** If Alice holds seats 1001 and 1004 while Bob holds 1004 and 1001, each could lock one seat and wait forever for the other. To prevent this, the app sorts `seatIds` in ascending order and locks rows in that order (`SELECT id FROM seats WHERE id IN (...) ORDER BY id FOR UPDATE` before the `UPDATE`). Every transaction then locks seats in the same order, so one simply waits for the other. A short `lock_timeout` (e.g. 2 seconds) makes sure a stuck request fails fast with `409` instead of hanging.

The **4-tickets-per-user limit** is checked in the same transaction (count of this user's held and paid seats for the event, after locking the user's row with `SELECT ... FOR UPDATE`), so two simultaneous requests from the same user cannot both slip under the limit.

### Layer 2 – Holds expire automatically

A hold lasts 10 minutes. If the user abandons checkout, the seat does not stay blocked forever:

- The `WHERE` clause above already treats an expired hold as available, so seats free up **immediately** at expiry, even before any cleanup runs.
- A background worker runs every minute to mark expired orders as `expired` and reset their seats to `available` (keeping the data tidy and the seat map accurate).

### Layer 3 – Payment confirms the seats in a second transaction

Payment is the risky moment, because it involves an external provider.

1. **Lock the order for payment.** In a transaction, change the order from `held` to `paying` and extend the hold by 5 minutes, **only if** it is still held, belongs to this user and has not expired. If 0 rows change → `410 Gone`. This stops the hold expiring while the card is being charged.
2. **Charge the card** with the payment provider, passing the idempotency key so a retry cannot charge twice.
3. **Confirm in one transaction:**

```sql
BEGIN;

UPDATE seats
SET    status = 'sold', held_until = NULL
WHERE  order_id = :orderId AND status = 'held';
-- must equal the number of seats in the order, otherwise ROLLBACK

INSERT INTO tickets (order_id, seat_id, code)
SELECT :orderId, id, :generatedCode            -- one unique code per seat
FROM   seats
WHERE  order_id = :orderId;

UPDATE orders
SET    status = 'paid', paid_at = CURRENT_TIMESTAMP, payment_ref = :paymentRef
WHERE  id = :orderId AND status = 'paying';

COMMIT;
```

If anything in this transaction fails, **all of it is rolled back** and a worker automatically refunds the payment. The user is never left charged without tickets.

### Layer 4 – Constraints as the final safety net

Even if a future bug skipped the checks above, the database itself refuses a double-booking:

- `tickets.seat_id UNIQUE` – a second ticket for the same seat is impossible; the `INSERT` fails and the transaction rolls back.
- `seats UNIQUE (event_id, section, row_label, seat_number)` – the same seat cannot be created twice for an event.
- `orders.idempotency_key UNIQUE` and `orders.payment_ref UNIQUE` – the same payment cannot be recorded twice.
- The `CHECK` on `seats` makes "available but owned by an order" impossible.

**Summary:** the transaction's conditional update makes sure only one person can hold a seat; the hold expiry makes sure abandoned seats return to sale; the payment transaction turns a hold into a sale all-or-nothing; and the UNIQUE constraints guarantee correctness even if the application code has a mistake.

---

## 7. Trade-offs

**1. Holding seats for 10 minutes vs. "first to pay wins"**
Holds give a fair, calm checkout: once you have the seats, nobody can take them while you type your card details. The cost is that seats can look sold out and then **reappear** when holds expire, and a few people may hold seats they never pay for. I chose holds because a checkout where you can lose your seat mid-payment feels unfair and causes angry users. A shorter hold (e.g. 5 minutes) would reduce blocked seats but pressure slower users and those on poor connections.

**2. Slightly stale seat map (cache) vs. a live seat map**
Serving the seat map from Redis, refreshed every 1–2 seconds, removes thousands of heavy queries per second from the database. The cost is that a user may click a seat that was taken a second ago and receive `409 Conflict`. This is acceptable because **correctness is still guaranteed by the database transaction** – the cache only affects what people *see*, never what they can *buy*. The front end handles the 409 nicely: it highlights the lost seat, refreshes the map and suggests nearby seats.

**3. Waiting room vs. letting everyone in at once**
The waiting room protects the system and makes the sale fair (random order at opening, then first-come, first-served). The cost is that users have to wait and may find the event sold out while in the queue, and the waiting room is an extra component to build and run. Letting everyone in at once would be simpler but would crash the site or reward bots and fast refreshers.

**4. Correctness over availability for purchases**
All holds and payments go through one primary database. This is the simplest way to guarantee one owner per seat, but it means the primary is a limit on write throughput and, if it fails, sales pause until a replica is promoted. I accept this because selling a seat twice is far worse than a short pause. If TicketHub grew much larger, the database could be **split by event** (sharding), since a hold never involves two events.

---

## 8. Alternatives considered

| Alternative | Why it was not chosen |
|---|---|
| **Check-then-write in application code** (`SELECT`, then `UPDATE`) | Has a race window between the two steps; double-bookings are possible. |
| **Locks kept in app-server memory** | Useless with many app servers – each server has its own memory. |
| **Seat locks only in Redis** | Very fast, but Redis and the database could disagree after a crash. The database is the source of truth, so the final decision must be made there. Redis locks could be added later as an extra fast filter. |
| **Document (NoSQL) database** | Our data is highly relational (users → orders → tickets → seats) and correctness depends on transactions and UNIQUE constraints, which relational databases handle best. |
| **"Best available" automatic seat assignment only** | Reduces conflicts during a big sale, but users strongly prefer choosing seats. It could be offered as an **option** during big sales ("give me the best 2 seats"). |
| **Pure autoscaling, no waiting room** | New servers take minutes to start, but the spike happens in seconds, and the database would still be overwhelmed by writes. |

---

## 9. Risks and open questions

**Risks**

- **Bots** may create many accounts to get multiple queue places. Mitigation: verified email/phone, CAPTCHA on joining the queue, rate limits and monitoring for suspicious patterns.
- **Payment provider slow or down** during a sale – holds could expire while users wait. Mitigation: the `paying` status extends the hold; automatic refunds if confirmation fails.
- **Payment succeeds but our server crashes before confirming** – the provider's webhook (processed by a worker) completes or refunds the order.
- **Primary database failure** during a sale – replica promotion takes time; sales pause and users wait in the waiting room.
- **Cache or waiting room misconfigured** – load testing must simulate a big sale (e.g. 15,000 requests/s) before the first real one.

**Open questions**

- What is the right hold length – 10 minutes, or shorter for big sales?
- Should "best available" become the default during big sales to reduce conflicts?
- Which payment methods must be supported (cards, mobile money), and do they all support idempotency keys and webhooks?
- What is the refund and cancellation policy if an event is cancelled?
- How many tickets per user should be allowed for each type of event?
