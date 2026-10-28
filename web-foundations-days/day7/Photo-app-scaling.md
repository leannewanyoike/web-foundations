# Day 7 Assignment: Designing PhotoShare for 1 Million Users

PhotoShare is a simple photo-sharing app. Users upload photos with a caption, and they scroll a feed of recent photos from people they follow. Each photo is shown as a small thumbnail in the feed and at full size when tapped.

---

## 0. Assumptions and daily active users

| Assumption | Value |
|---|---|
| Registered users | 1,000,000 |
| Share of users active on a given day | 20% |
| Photos uploaded per active user per day | 2 |
| Feed views per active user per day | 30 |
| Thumbnails shown per feed view | 10 |
| Average original photo size | 2 MB |
| Average thumbnail size | 50 KB |
| Photo metadata row in the database (id, user, caption, keys, time, status) | 500 bytes |
| Peak traffic | 5× the average |

```text
Daily active users (DAU) = 1,000,000 × 20% = 200,000 users
```

---

## 1. Calculations

```text
Seconds in a day ≈ 86,400  (round to 100,000 for easy maths)

Uploads:      200,000 users × 2 photos       = 400,000 uploads per day
              400,000 ÷ 100,000              ≈ 4 uploads per second
              Peak (5×)                      ≈ 20 uploads per second

Feed views:   200,000 users × 30 views       = 6,000,000 feed views per day
              6,000,000 ÷ 100,000            ≈ 60 feed views per second
              Peak (5×)                      ≈ 300 feed views per second

Image loads:  60 feed views/s × 10 thumbnails ≈ 600 images per second
              Peak (5×)                       ≈ 3,000 images per second

Photo storage per year:
  Originals:   400,000 photos/day × 2 MB     = 800,000 MB = 800 GB per day
               800 GB × 365                  ≈ 292,000 GB ≈ 292 TB per year
  Thumbnails:  400,000 photos/day × 50 KB    = 20,000 MB = 20 GB per day
               20 GB × 365                   ≈ 7.3 TB per year
  Total photos                               ≈ 300 TB per year

Metadata in the database:
               400,000 rows/day × 500 bytes  = 200 MB per day
               200 MB × 365                  ≈ 73 GB per year
```

**What this tells us:** the request rates are small (300 feed views per second at peak is easy for a few app servers), but the photo storage is huge (about 300 TB per year) while the metadata is tiny (about 73 GB per year). The real challenge is storing and delivering images, not handling API requests.

---

## 2. Read-heavy or write-heavy?

PhotoShare is **read-heavy**. There are 60 feed views per second against 4 uploads per second, which is 15× more reads than writes. Counting individual images, it is 600 image loads per second against 4 uploads, about 150×.

What this means for the design:

- **Cache the feeds.** Most feed requests should be answered from Redis instead of the database.
- **Use read replicas.** Feed queries that miss the cache go to replicas, leaving the primary free for writes.
- **Serve every image through a CDN.** At 3,000 images per second at peak, images must come from edge servers near the user, not from our own servers.
- **Do slow write work in the background.** Uploads are rare, so it is fine for thumbnail creation to happen a few seconds later in a worker.

---

## 3. Why photos should not be stored in the database

- **Size.** At about 300 TB per year, photos would turn a 73 GB database into one that is 4,000× bigger. Databases are built for many small structured rows, not huge binary files.
- **Speed.** Large blobs fill the database's memory cache and slow down normal queries for everyone.
- **Replication and backups.** Every replica would need its own copy of all 300 TB, and backups would take hours or days.
- **Cost.** Database disk space is much more expensive than object storage.
- **Delivery.** A CDN cannot pull images directly out of a database; every image request would have to go through our app servers.

**Where they go instead:** photos are stored in **object storage** (for example Amazon S3, Cloudflare R2 or Google Cloud Storage), which is cheap, nearly unlimited and designed for large files. The database only stores **metadata**, including the storage key (for example `photos/thumbnails/42.jpg`). The CDN sits in front of object storage, so users download images from a nearby edge server.

---

## 4. Architecture

```text
                          ┌─────────┐
           ┌─────────────>│   DNS   │  (photoshare.com → IP addresses)
           │              └─────────┘
  ┌────────┴──────┐  static files + photos  ┌──────────────────┐
  │ Browser /     │ ──────────────────────> │ CDN edge servers │
  │ mobile client │                         └────────┬─────────┘
  └────────┬──────┘                                  │ miss only
           │ API calls (HTTPS, JSON, uploads)        v
           v                                ┌──────────────────┐
   ┌───────────────┐                        │ Object storage   │
   │ Load balancer │                        │  originals/      │
   └───────┬───────┘                        │  thumbnails/     │
      ┌────┴─────┬──────────┐               └──────────────────┘
      v          v          v                  ^            ^
  ┌───────┐  ┌───────┐  ┌───────┐              │            │
  │ App 1 │  │ App 2 │  │ App 3 │ ── original ─┘            │ read original,
  └───┬───┘  └───┬───┘  └───┬───┘                           │ save thumbnail
      │          │          ├────> ┌───────────────┐        │
      │ writes   │ reads    │ cache│ Cache (Redis) │        │
      │          │          │ jobs └───────────────┘        │
      v          v          v                               │
  ┌─────────┐ ┌──────────┐ ┌───────┐   ┌──────────────────┐ │
  │ Primary │>│ Read     │ │ Queue │──>│ Thumbnail worker │─┘
  │   DB    │ │ replicas │ └───────┘   └────────┬─────────┘
  └────▲────┘ └──────────┘                      │
       └──────── mark photo "ready" ────────────┘
```

Every app server talks to the same cache, databases, object storage and queue; the arrows from individual servers are only drawn once to keep the diagram readable.

---

## 5. Each component in one sentence

- **Browser / mobile client:** shows the feed, lets the user pick a photo and calls the API over HTTPS.
- **DNS:** translates `photoshare.com` into the IP addresses of the load balancer and CDN.
- **CDN:** serves the front-end files and all photos from edge servers close to the user, so images load fast and our servers are not overloaded.
- **Load balancer:** spreads API requests across the healthy app servers and stops sending traffic to any server that fails its health check.
- **App servers (stateless):** check the user's token, validate requests, read and write metadata, and add jobs to the queue.
- **Cache (Redis):** keeps recently built feeds in memory so most feed views never touch the database.
- **Primary database:** the single source of truth for users, follows and photo metadata, and the only database that accepts writes.
- **Read replicas:** copies of the primary that answer feed queries when the cache misses.
- **Object storage:** stores the actual image files (originals and thumbnails) cheaply and at practically unlimited scale.
- **Message queue:** holds thumbnail jobs so the app can reply to the user immediately and jobs can wait safely during a spike.
- **Thumbnail worker:** takes jobs from the queue, resizes the original into a thumbnail, saves it and marks the photo as ready.

---

## 6. Upload flow, step by step

1. **User picks a photo.** The client sends `POST /photos` with the image file and caption over HTTPS.
2. **Load balancer** forwards the request to any healthy app server (about 1 ms).
3. **App server checks the request.** It verifies the token to identify the user, checks the file type (JPEG or PNG) and rejects files over a size limit such as 10 MB with `400 Bad Request`.
4. **Save the original.** The app server generates a new photo id (for example 42) and stores the file in object storage as `photos/originals/42.jpg`.
5. **Save the metadata.** It inserts a row into the **primary** database: id 42, user id, caption, original key, created time and `status = "processing"`.
6. **Add the thumbnail job.** It adds a job to the queue: `{ "job": "make_thumbnail", "photoId": 42 }`.
7. **Reply immediately.** It responds with `201 Created` and the photo id. The user sees "Photo uploaded!" without waiting for resizing.
8. **Worker takes the job.** A thumbnail worker pulls the job from the queue and downloads `photos/originals/42.jpg` from object storage.
9. **Create the thumbnail.** The worker resizes the image (for example to 400 px wide), compresses it and saves it as `photos/thumbnails/42.jpg`.
10. **Mark the photo ready.** The worker updates the row in the primary database: `thumbnail_key = "photos/thumbnails/42.jpg"`, `status = "ready"`. The change is copied to the read replicas within milliseconds.
11. **Refresh the feeds.** The worker deletes the uploader's cached feed and their followers' cached feeds from Redis (for example `feed:user:7`), so the next feed load includes the new photo.
12. **Photo appears in feeds.** Followers' next feed request misses the cache, reads from a replica, and the client loads the thumbnail through the CDN.

**If the worker fails:** the job stays in the queue (or is put back after a timeout) and another worker retries it with back-off, so the thumbnail is still created. The photo remains "processing" in the meantime, so it simply does not show in feeds yet.

**Possible improvement:** at larger scale, the app server could hand the client a short-lived *pre-signed upload URL* so the client uploads the file straight to object storage, and app servers never have to carry 2 MB files.

---

## 7. Trade-offs

**Background thumbnails: speed versus immediacy.** Making thumbnails in a worker means the upload responds in milliseconds and spikes of uploads just wait in the queue. The cost is that a new photo is not visible in feeds for a few seconds, and there are more moving parts (queue, workers, retry logic). For a photo app, a few seconds' delay is acceptable.

**Cached feeds and read replicas: speed versus freshness.** Serving feeds from Redis and replicas keeps the database load low, but a feed may briefly be out of date because of the cache or replication lag. That is acceptable for photos. One exception is worth handling: right after uploading, the uploader should see their own photo, so their own profile page can be read from the primary database.

**Object storage plus CDN: cost and scale versus simplicity.** Storing images outside the database is much cheaper and scales to hundreds of terabytes, but the data now lives in two places that must stay in step (a metadata row without a file, or a file without a row, are both possible after a failure). Also, when a user deletes a photo, copies may stay on CDN edge servers until they expire, so deletion should also send a CDN purge request.

**Storage cost versus quality.** Keeping the 2 MB original of every photo costs about 292 TB per year. Compressing originals or keeping only a reduced "large" version would save a lot of money, but users could not get back their full-quality photo.
