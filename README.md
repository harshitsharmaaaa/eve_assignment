# EVE Healthcare — diagnostic test bookings + simulated payments

Backend service for booking diagnostic tests and taking (simulated) payments for them.

## How to run the project locally

You need [Bun](https://bun.com) v1.3+ and Postgres 15+. Two ways to run:

### Option A — Docker (one command, app + Postgres)

```bash
cp .env.example .env
docker-compose up --build
```

That starts Postgres, creates the tables, seeds two centres with tests, and starts the API on http://localhost:3000. Swagger UI is at http://localhost:3000/docs.

### Option B — local Bun + your own Postgres

```bash
bun install
cp .env.example .env
# edit .env and set DATABASE_URL to your Postgres connection string,
# plus JWT_SECRET to any long random string
bun --cwd packages/db prisma db init
bun run seed
bun run start
```

API is at http://localhost:3000 after that.

### Running the tests

```bash
bun run test
```

Tests hit the real endpoints with a real database (whatever `DATABASE_URL` points at). Each test creates its own users/centres/bookings with unique emails and deletes them afterwards.

## API endpoints

Base URL is `http://localhost:3000`. Full interactive docs with request shapes at `/docs` (generated from the same zod schemas that validate requests).

### POST /auth/signup

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"ann@example.com","password":"password123"}'
```

```json
{"id":"3789e20f-aeb9-478b-9ce4-63cbb7e8532d","email":"ann@example.com","token":"eyJhbG..."}
```

### POST /auth/login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ann@example.com","password":"password123"}'
```

```json
{"id":"3789e20f-aeb9-478b-9ce4-63cbb7e8532d","email":"ann@example.com","token":"eyJhbG..."}
```

### POST /centers

```bash
curl -X POST http://localhost:3000/centers \
  -H "Content-Type: application/json" \
  -d '{"name":"City Diagnostics","location":"MG Road"}'
```

```json
{"id":"185b5e57-8158-4784-b68b-341eb9402a44","name":"City Diagnostics","location":"MG Road"}
```

### GET /centers

```bash
curl http://localhost:3000/centers
```

```json
[{"id":"185b5e57-...","name":"City Diagnostics","location":"MG Road","tests":[{"id":"0d89-...","name":"CBC","price":"299.00","centreId":"185b5e57-..."}]}]
```

### GET /centers/:id

```bash
curl http://localhost:3000/centers/185b5e57-8158-4784-b68b-341eb9402a44
```

Same shape as one entry of the list. Unknown id returns `404 {"message":"Invalid centre id"}`.

### POST /centers/:id/tests

```bash
curl -X POST http://localhost:3000/centers/185b5e57-8158-4784-b68b-341eb9402a44/tests \
  -H "Content-Type: application/json" \
  -d '{"name":"CBC","price":299.00}'
```

```json
{"id":"0d8981ef-...","name":"CBC","price":"299.00","centreId":"185b5e57-..."}
```

Unknown centre id returns `404`.

### POST /bookings/book (needs login)

```bash
curl -X POST http://localhost:3000/bookings/book \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbG..." \
  -d '{"testId":"0d8981ef-...","appointmentAt":"2026-10-05T10:00:00.000Z"}'
```

```json
{"id":"ca71e696-...","userId":"3789e20f-...","testId":"0d8981ef-...","appointmentAt":"2026-10-05T10:00:00.000Z","amount":"299.00","status":"PENDING","test":{...},"centre":{...}}
```

Unknown test id returns `404`. Past dates and bad shapes return `400`. No/bad token returns `401`.

### GET /bookings (needs login)

```bash
curl http://localhost:3000/bookings -H "Authorization: Bearer eyJhbG..."
```

Returns your bookings only.

### GET /bookings/:id (needs login)

```bash
curl http://localhost:3000/bookings/ca71e696-... -H "Authorization: Bearer eyJhbG..."
```

Someone else's booking returns `403 {"message":"Not your booking"}`. Unknown id returns `404`.

### POST /bookings/:id/cancel (needs login)

```bash
curl -X POST http://localhost:3000/bookings/ca71e696-.../cancel -H "Authorization: Bearer eyJhbG..."
```

Only `PENDING` bookings can be cancelled, otherwise `409`. Someone else's booking returns `403`.

### POST /payments (needs login)

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbG..." \
  -d '{"bookingId":"ca71e696-..."}'
```

```json
{"payment":{"id":"f2f7bc86-...","bookingId":"ca71e696-...","status":"SUCCESS","providerRef":"pay_1790622978840_870371","processedAt":"2026-09-28T19:16:19.115Z","rawEvent":null},"booking":{"id":"ca71e696-...","status":"CONFIRMED",...}}
```

`SUCCESS` confirms the booking, `FAILED` marks it failed. Send `"force":"SUCCESS"` or `"force":"FAILED"` to skip the coin flip (handy for testing). Paying an already-paid or cancelled booking returns `409`. Someone else's booking returns `403`, unknown id returns `404`.

### POST /payments/webhook (no login — called by the payment provider)

```bash
curl -X POST http://localhost:3000/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt_123","bookingId":"ca71e696-...","status":"SUCCESS"}'
```

```json
{"ok":true,"deduped":false,"payment":{...},"booking":{"id":"ca71e696-...","status":"CONFIRMED",...}}
```

Sending the same `eventId` again returns `200 {"ok":true,"deduped":true,...}` without changing anything.

## Database/schema design

All models live in `packages/db/src/prisma/contract.prisma`.

- **User** — id, email (unique), passwordHash, createdAt. Passwords are never stored plain, only the bcrypt hash. Email is lowercased on signup/login so `Ann@x.com` and `ann@x.com` are the same account.
- **DiagnosticCentre** — id, name, location. Keeps no test data inside itself; tests link to it.
- **DiagnosticTest** — id, name, price, centreId. Each test belongs to exactly one centre, so "tests a centre offers" is just all tests with that centreId. Price is `Decimal`, not float (see below).
- **Booking** — id, userId, testId, appointmentAt, amount, status (`PENDING`/`CONFIRMED`/`FAILED`/`CANCELLED`), createdAt. The centre is not copied onto the booking — it is reached through the test (`booking -> test -> centre`), so there is only one place where the test-centre link lives and it cannot go out of sync. `amount` is snapshotted from the test price at booking time, so later price changes do not rewrite history.
- **Payment** — id, bookingId (unique — one payment per booking, ever), status, providerRef (unique — the provider's event id, so the same event can never be stored twice), rawEvent (kept for debugging), processedAt.

## Important assumptions I made

- Payments are simulated. There is no real gateway; `POST /payments` flips a coin (or takes a `force` override) and the webhook pretends to be the provider calling back.
- The webhook is open (no auth) because in real life it is called server-to-server by the payment provider, not by the user. The `eventId` is what makes it safe to retry.
- One payment per booking. A failed payment does not get retried through a new payment row — the booking just stays `FAILED`.
- Only `PENDING` bookings can be paid or cancelled. Anything else returns `409`.
- Centre/test management endpoints are open (no admin role). The assignment only asked for auth around bookings, so I kept it simple instead of inventing roles.
- Money comes in as a normal JSON number (e.g. `299.00`) and is stored as an exact decimal string from there on.

## What I'd improve with more time

- Real provider signature check on the webhook (HMAC secret) instead of trusting the body.
- Refresh tokens and password reset, plus rate limiting on login.
- Pagination and filtering on the list endpoints.
- A `CANCELLED` booking flow that releases/refunds, and retry support for `FAILED` payments.
- Optimistic locking on bookings if concurrent pay/cancel from different devices becomes common.
- CI running `bun run test` plus `bunx tsc --noEmit` on every push.

## Design decisions & trade-offs

**How webhook idempotency is guaranteed.** Three layers, so that even two identical webhooks arriving at the exact same moment only apply once: (1) `providerRef` (the event id) has a unique constraint in the database — the same event physically cannot be inserted twice; (2) `bookingId` is also unique in the payments table, so even a different event for an already-paid booking cannot create a second payment; (3) the webhook runs inside one database transaction that re-checks for the event before inserting, and only moves the booking out of `PENDING` — so a replay can never flip a `CONFIRMED`/`CANCELLED` booking back, and the loser of a race hits the unique constraint, catches it, and returns `200` with `deduped:true` instead of an error. Returning `200` on duplicates matters because providers retry webhooks until they see success; a `4xx` would cause endless retries.

**Why money is stored as Decimal, not float.** Floats cannot represent most decimal prices exactly (`0.1 + 0.2` is `0.30000000000000004`), so adding, comparing, or charging float amounts can drift by a paisa/cent and never match the provider's records. `Decimal` (Postgres `numeric`) stores `299.00` exactly. That is why the code passes prices around as strings like `"299.00"` and never does float math on them — the `toFixed(2)` on the way in only normalises the shape, the value itself stays exact end to end.
