# ParcelFlow API

Parcel delivery management. Customers create parcels, admins assign delivery staff,
staff move parcels through a fixed status flow. Every status change is written to an
append-only history table.

Node.js 22, Express 5, PostgreSQL 16, Prisma 6, Zod 4, JWT, bcryptjs.

## Contents

- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Seeded accounts](#seeded-accounts)
- [Status flow](#status-flow)
- [Response format](#response-format)
- [Postman collection](#postman-collection)
- [Endpoints](#endpoints)
- [Roles and visibility](#roles-and-visibility)
- [Project structure](#project-structure)
- [Notes on a few decisions](#notes-on-a-few-decisions)

## Setup

You need Node 22 or newer and Docker. Node 22 specifically, because the app reads
`.env` with `process.loadEnvFile()` instead of pulling in `dotenv`.

```bash
node -v && docker -v
```

From a fresh clone:

```bash
npm install
cp .env.example .env
```

Generate a signing secret and paste it into `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then start the database, migrate, seed, run:

```bash
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run check` verifies the whole stack in one go: Docker daemon, both containers,
the port, the process, the database, a login, and an authenticated read. It exits 0
when everything passes and prints the fixing command next to whatever failed.

## Environment variables

`.env` is gitignored. `.env.example` is committed and lists every variable with no
real values in it.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test` or `production` |
| `PORT` | Port the server binds to |
| `DATABASE_URL` | Runtime database connection |
| `DIRECT_URL` | Migrations only. DDL cannot run through a transaction pooler, so on a hosted database this differs from `DATABASE_URL` |
| `TEST_DATABASE_URL` | Separate database for tests, which truncate tables |
| `JWT_SECRET` | Signing secret, at least 32 characters |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `15m`, `1h`, `1d` |
| `BCRYPT_ROUNDS` | Cost factor. 10 to 12 normally, lower in tests |
| `REDIS_URL` | Optional. Shares rate-limit counters across instances. Unset means in-memory |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | Login window, milliseconds |
| `RATE_LIMIT_LOGIN_MAX` | Login attempts allowed per window |
| `RATE_LIMIT_TRACKING_WINDOW_MS` | Tracking window, milliseconds |
| `RATE_LIMIT_TRACKING_MAX` | Tracking lookups allowed per window |
| `SEED_ADMIN_EMAIL` | Seeded admin email |
| `SEED_ADMIN_PASSWORD` | Seeded admin password, development only |
| `SEED_STAFF_PASSWORD` | Seeded staff password, development only |
| `SEED_CUSTOMER_PASSWORD` | Seeded customer password, development only |

All of these are validated with Zod at boot. A missing `JWT_SECRET` prints the name of
the offending variable and exits, rather than starting up and signing tokens with
`undefined`.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Start with `node --watch` |
| `npm start` | Start without watching |
| `npm run check` | Health check the stack |
| `npm run db:up` / `db:down` | Start or stop the containers |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply committed migrations, for CI and production |
| `npm run db:seed` | Seed users and parcels |
| `npm run db:studio` | Prisma Studio |

## Seeded accounts

Development only. These passwords are deliberately trivial so a reviewer can log in
without looking anything up. Change them before seeding anywhere public.

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@parcelflow.dev` | `123` |
| DELIVERY_STAFF | `rahim.staff@parcelflow.dev` | `123` |
| DELIVERY_STAFF | `karim.staff@parcelflow.dev` | `123` |
| CUSTOMER | `ayesha.customer@parcelflow.dev` | `123` |
| CUSTOMER | `tanvir.customer@parcelflow.dev` | `123` |

The seed also writes seven parcels, one in each status plus a couple of extras, each
with a full history trail. That gives `/admin/stats` something real to report instead
of seven rows all sitting in PENDING.

Re-running is safe. Users are upserted by email; parcels are only created if the table
is empty.

## Status flow

```
PENDING -> PICKED_UP -> IN_TRANSIT -> OUT_FOR_DELIVERY -> DELIVERED
```

| From | To |
|---|---|
| `PENDING` | `PICKED_UP` |
| `PICKED_UP` | `IN_TRANSIT` |
| `IN_TRANSIT` | `OUT_FOR_DELIVERY` |
| `OUT_FOR_DELIVERY` | `DELIVERED` |
| `DELIVERED` | terminal |

Four legal moves out of 25 possible pairs. Setting a parcel to the status it already
has is rejected too, since it would put a meaningless row in the audit trail. The
table lives in `src/domain/parcelStatus.js`.

## Response format

Success:

```json
{
  "success": true,
  "data": { },
  "meta": { "page": 1, "limit": 20, "total": 7, "totalPages": 1 }
}
```

`meta` only appears on list endpoints.

Failure:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Parcel is Delivered, which is final; it cannot move to Picked Up",
    "details": { },
    "requestId": "78ce46f6-6455-4d82-a4d6-91933363bb63"
  }
}
```

Branch on `code`, not on `message`. Messages get reworded; codes do not. `requestId`
is on every error and matches the `X-Request-Id` header, so a failure someone reports
can be found in the logs.

| Status | When |
|---|---|
| 200 | Read or update succeeded |
| 201 | Created |
| 401 | Token missing, malformed, expired or invalid |
| 403 | Known caller, wrong role for this endpoint |
| 404 | Not found, or outside the caller's scope |
| 409 | Duplicate email, illegal transition, or a concurrent update |
| 413 | Body over 100kb |
| 422 | Validation failed |
| 429 | Rate limited |
| 500 | Unexpected. Message is always generic |
| 503 | Database unreachable |

## Postman collection

[`ParcelFlow.postman_collection.json`](ParcelFlow.postman_collection.json) covers every endpoint below —
23 requests in four folders, with 14 test scripts.

Import it, set `baseUrl` if you are not on `http://localhost:3000`, then run the three requests in the
**Auth** folder first. Their test scripts save `customerToken`, `staffToken`, `adminToken` and `staffId`
into collection variables, and **Create parcel** saves `parcelId` and `trackingCode`, so every other
request works without pasting a token or an id by hand.

It also carries the failure cases, each named with the code it expects: 422 for a `role` in the register
body, 401 for a wrong password, 401 for an unknown email (identical response, by design), 409 for an
illegal status transition, and 403 for a customer reaching a staff or admin route.

## Endpoints

Authenticated routes want `Authorization: Bearer <token>`.

### `POST /auth/register`

Creates a customer. The role is not read from the body and cannot be set.

`name` is 2 to 80 characters, `email` must be a valid address and is trimmed and lowercased before
storage, and `password` is 8 to 72 characters — 72 because bcrypt silently truncates past that, which
would let two different passwords open the same account. Anything else gets a 422 naming the field.

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test User","email":"test@example.com","password":"Passw0rd!23"}'
```

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": "1d",
    "user": {
      "id": "01a042a6-11f9-7382-aeef-ba400a207737",
      "name": "Test User",
      "email": "test@example.com",
      "role": "CUSTOMER",
      "createdAt": "2026-08-27T09:56:14.969Z"
    }
  }
}
```

Adding `"role": "ADMIN"` gets a 422:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "location": "body", "field": "(root)", "message": "Unrecognized key: \"role\"" }
    ],
    "requestId": "a750ba4e-47d1-4749-b579-dc2dbddb8ba7"
  }
}
```

### `POST /auth/login`

Rate limited.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@parcelflow.dev","password":"123"}'
```

A wrong password and an email that does not exist produce the same 401:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "requestId": "3816564e-9c79-447e-a7bb-437023aea899"
  }
}
```

### `GET /auth/me`

Whoever the token belongs to. The user is loaded from the database on every request,
so demoting or deleting an account takes effect immediately rather than whenever the
token happens to expire.

```bash
curl http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"
```

### `POST /parcels`

Customer or admin. Creates the parcel in PENDING with a generated tracking code, and
writes its first history row in the same transaction.

```bash
curl -X POST http://localhost:3000/parcels \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"senderName":"Ayesha Rahman","receiverName":"Tanvir Hasan","pickupArea":"Gulshan","deliveryArea":"Dhanmondi","parcelType":"Documents"}'
```

```json
{
  "success": true,
  "data": {
    "id": "01a042b6-4457-75d0-998f-8f2308133116",
    "trackingCode": "PF-9FMG9-8VDYP",
    "senderName": "Ayesha Rahman",
    "receiverName": "Tanvir Hasan",
    "pickupArea": "Gulshan",
    "deliveryArea": "Dhanmondi",
    "parcelType": "Documents",
    "status": "PENDING",
    "customerId": "01a042b4-03e2-73e3-971f-8ca2d11ea6ad",
    "assignedStaffId": null,
    "createdAt": "2026-08-27T10:13:56.445Z",
    "updatedAt": "2026-08-27T10:13:56.445Z",
    "customer": { "id": "01a042b4-03e2-73e3-971f-8ca2d11ea6ad", "name": "Ayesha Rahman" },
    "assignedStaff": null
  }
}
```

### `GET /parcels`

Any role. Scoped to what the caller can see.

| Query | |
|---|---|
| `status` | One of the five |
| `deliveryArea` | Exact, case-insensitive |
| `pickupArea` | Exact, case-insensitive |
| `trackingCode` | Partial, 2 to 20 characters |
| `page` | Default 1 |
| `limit` | Default 20, max 100 |
| `sort` | `createdAt:desc` (default), `createdAt:asc`, `updatedAt:desc`, `updatedAt:asc` |

```bash
curl "http://localhost:3000/parcels?status=PENDING&limit=10" -H "Authorization: Bearer $TOKEN"
```

Array in `data`, pagination in `meta`.

### `GET /parcels/:trackingCode`

Rate limited. Returns the parcel with its history. Someone else's tracking code
returns 404, not 403.

```bash
curl http://localhost:3000/parcels/PF-9FMG9-8VDYP -H "Authorization: Bearer $TOKEN"
```

### `GET /parcels/:id/history`

Any role, scoped. Oldest first.

```bash
curl http://localhost:3000/parcels/01a042b6-4457-75d0-998f-8f2308133116/history \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "data": {
    "parcelId": "01a042b6-4457-75d0-998f-8f2308133116",
    "trackingCode": "PF-9FMG9-8VDYP",
    "currentStatus": "DELIVERED",
    "history": [
      {
        "id": "01a042b6-445c-7760-8715-97be26a15a5d",
        "oldStatus": null,
        "newStatus": "PENDING",
        "createdAt": "2026-08-27T10:13:56.445Z",
        "changedBy": { "id": "01a042b4-03e2-73e3-971f-8ca2d11ea6ad", "name": "Ayesha Rahman", "role": "CUSTOMER" }
      },
      {
        "id": "01a042b7-6d18-7fb0-ac57-33ef62db7112",
        "oldStatus": "PENDING",
        "newStatus": "PICKED_UP",
        "createdAt": "2026-08-27T10:15:12.408Z",
        "changedBy": { "id": "01a042b4-035e-7b13-8c57-0562fcd0bea7", "name": "Rahim Uddin", "role": "DELIVERY_STAFF" }
      }
    ]
  }
}
```

`oldStatus` is null on exactly one row per parcel, the creation record.

### `PATCH /parcels/:id/status`

Delivery staff or admin. Staff can only touch parcels assigned to them.

```bash
curl -X PATCH http://localhost:3000/parcels/$PARCEL_ID/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"PICKED_UP"}'
```

An illegal move comes back as 409, and says what would have been legal:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Parcel is Delivered, which is final; it cannot move to Picked Up",
    "details": {
      "currentStatus": "DELIVERED",
      "requestedStatus": "PICKED_UP",
      "allowedNext": []
    },
    "requestId": "78ce46f6-6455-4d82-a4d6-91933363bb63"
  }
}
```

If two requests race, the loser gets 409 with code `STATUS_CONFLICT` instead.

### `PATCH /parcels/:id/assign`

Admin. `null` clears the assignment.

```bash
curl -X PATCH http://localhost:3000/parcels/$PARCEL_ID/assign \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"staffId":"01a042b4-035e-7b13-8c57-0562fcd0bea7"}'
```

422 if the target is not delivery staff. 409 if the parcel is already delivered.

### `GET /admin/stats`

Admin. Counts, groupings and one aggregate, all computed in the database.

```bash
curl http://localhost:3000/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN"
```

```json
{
  "success": true,
  "data": {
    "parcels": {
      "total": 7,
      "byStatus": {
        "PENDING": 2,
        "PICKED_UP": 1,
        "IN_TRANSIT": 1,
        "OUT_FOR_DELIVERY": 1,
        "DELIVERED": 2
      },
      "unassigned": 2,
      "createdLast7Days": 7,
      "deliveryRate": 0.286
    },
    "users": {
      "total": 6,
      "byRole": { "CUSTOMER": 3, "DELIVERY_STAFF": 2, "ADMIN": 1 }
    },
    "delivery": {
      "deliveredCount": 2,
      "averageHoursToDeliver": 20
    },
    "topDeliveryAreas": [
      { "deliveryArea": "Gulshan", "count": 2 },
      { "deliveryArea": "Dhanmondi", "count": 1 }
    ],
    "generatedAt": "2026-08-27T10:12:07.136Z"
  }
}
```

`byStatus` and `byRole` always list every key, zeros included, so clients do not have
to cope with missing ones.

### `GET /admin/users`

Admin. Filter by `role`, search `name` and `email` with `search`, paginate with `page`
and `limit`.

```bash
curl "http://localhost:3000/admin/users?role=DELIVERY_STAFF" -H "Authorization: Bearer $ADMIN_TOKEN"
```

### `PATCH /admin/users/:id/role`

Admin. Cannot be used on yourself, which stops the last admin locking themselves out.
Demoting a staff member also releases their undelivered parcels, in the same
transaction, so no parcel is left assigned to someone who can no longer act on it.

```bash
curl -X PATCH http://localhost:3000/admin/users/$USER_ID/role \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"DELIVERY_STAFF"}'
```

### Health

`GET /` returns the service name, version and route prefixes.

`GET /health` says the process is up. It never queries the database, so an uptime
monitor can hit it as often as it likes.

`GET /health/db` queries too, and returns 503 when the database is unreachable.

## Roles and visibility

Two different questions, handled in two different places.

Whether a role may call an endpoint at all is middleware, and failing it is a 403.
Which records a caller can see is a query condition inside the service, and a record
outside your scope is a 404.

| Role | Sees | Create | Advance status | `/admin` |
|---|---|---|---|---|
| `CUSTOMER` | Own parcels | yes | no | no |
| `DELIVERY_STAFF` | Assigned parcels | no | yes, their own | no |
| `ADMIN` | Everything | yes | yes | yes |

Ownership goes into the `WHERE` clause of every read, so a row you are not allowed to
see never leaves the database. Hence 404 rather than 403 for someone else's parcel: a
403 would tell you it exists.

## Project structure

```
prisma/
  schema.prisma          three models, two enums, six indexes
  migrations/
  seed.js
src/
  config/env.js          validated at boot
  lib/
    prisma.js            one client for the process
    logger.js            JSON lines
  utils/
    AppError.js
    response.js
    password.js
    jwt.js
    trackingCode.js
  domain/
    parcelStatus.js      transition rules, imports nothing
  middleware/
    requestId.js         registered first
    requestLogger.js
    authenticate.js
    authorize.js
    validate.js
    rateLimit.js
    notFound.js
    errorHandler.js
  modules/
    auth/                schemas, service, controller, routes
    parcels/
    admin/
  app.js                 builds the app
  server.js              listens, shuts down gracefully
scripts/check.sh
docker/init-test-db.sql
```

## Notes on a few decisions

`app.js` builds the app and `server.js` is the only thing that calls `listen()`. Tests
can then import the app and drive it with supertest without binding a port.

Registration cannot produce an admin. The Zod schema is a `strictObject`, so an
unexpected `role` key is a 422, and the service hard-codes `CUSTOMER` anyway. Staff
and admin accounts come from the seed or from an existing admin.

Login gives the same answer whether the email is unknown or the password is wrong,
including roughly the same response time. Without the dummy bcrypt compare on the
unknown-email path, the timing difference alone would tell you which addresses are
registered.

Tracking codes come from `crypto.randomInt`. `Math.random()` is seeded from
predictable state, and predictable codes mean someone can enumerate other people's
parcels. Uniqueness is left to the database constraint with a retry on collision,
because checking first and inserting second is a race.

Status updates are conditional on the status still being what was read a moment
earlier. Two people advancing the same parcel at once would otherwise both pass
validation and both write history; instead the second matches zero rows and rolls
back.

Transition rules are not in the schema. The database enum can list five states but
cannot say that PENDING only becomes PICKED_UP. That lives in a module with no
imports, which is what makes it testable without a database.
