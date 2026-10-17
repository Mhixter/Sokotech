# SOKOTECH

SOKOTECH is a Nigerian multi-service identity and agent-operations platform.
The public landing page and verification explainer are available before sign-in.
Account registration, sign-in, and the Super Agent operations area require the
Node.js service and PostgreSQL; the platform deliberately shows an unavailable
state rather than sample operational numbers when its database is not connected.

## Requirements

- Node.js 22 or newer
- PostgreSQL 13 or newer
- A unique random session secret of at least 32 characters
- Three separate 32-byte encryption keys, each stored as 64 hexadecimal characters

Generate separate keys with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Do not commit `.env` or reuse the PIN encryption key for identity data, PIN
fingerprints, or session authentication.

## Local setup

1. Create a PostgreSQL database and login, then copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `SESSION_SECRET`, `PIN_ENCRYPTION_KEY`,
   `PIN_FINGERPRINT_KEY`, and `IDENTITY_ENCRYPTION_KEY`. Use a different key
   for every value.
3. Install dependencies with `npm install`.
4. Apply the additive schema migration with `npm run migrate`.
5. Set `INITIAL_ADMIN_EMAIL` and a unique `INITIAL_ADMIN_PASSWORD` of at least
   16 characters in your environment; run `npm run seed:admin` once. The seed
   command never modifies an existing account.
6. Remove the initial administrator password from the environment and run
   `npm start`. Open `http://localhost:3000`.

## Local demo sandbox

To explore the operations dashboard and its customer view without touching a
live database, create a separate local PostgreSQL database named exactly
`sokotech_demo`. Use a local `.env` with `NODE_ENV=development`,
`DATABASE_URL=postgres://.../sokotech_demo`, the required session/encryption
keys, `ENABLE_DEMO_SEED=true`, and a unique `DEMO_ADMIN_PASSWORD` of 16–128
characters. Never point this seed command at a production or shared database.

Run `npm run migrate`, then `npm run seed:demo`, then `npm start`. Sign in at
`/login.html` with **demo.admin@sokotech.local** and the password you set in
`DEMO_ADMIN_PASSWORD`. From the operations dashboard use **Customer view** to
inspect the same account's sample customer requests, then **Demo admin view**
to return.

The seed is repeatable and resets only the demo fixtures in `sokotech_demo`.
It refuses to run outside development, without the explicit opt-in, against a
database with another name, or without a user-provided strong password. Demo
products, requests, transactions, audit events, and PIN inventory are isolated
from non-demo records and visibly labeled. All records are synthetic: no
payment is confirmed, no provider or government identity service is contacted,
and example PINs are encrypted but cannot be redeemed. Keep demo credentials
and database access local; do not expose this account on a public deployment.

Production deployments should use a managed secrets store, TLS, PostgreSQL
backups, restricted database networking, and `NODE_ENV=production`. If your
hosted PostgreSQL requires TLS, set `DATABASE_SSL=true` after verifying its
server certificate configuration.

## Implemented foundation

- Same-origin Express 5 service with PostgreSQL-backed, HTTP-only sessions.
- Server-validated account creation and sign-in, bcrypt password hashing,
  session rotation, role-checked administrative endpoints, mutation CSRF
  tokens, and rate-limited authentication.
- Additive migration for accounts, products, consented and encrypted service
  requests, transactions, encrypted PIN stock, inventory movement, and audit
  events.
- Database-derived Super Agent transaction/revenue/profit metrics, activity,
  catalog pricing, request review, transaction ledger, and batch reconciliation.
- CSV education PIN imports with duplicate detection, AES-256-GCM encryption,
  HMAC fingerprints, row limits, and a transactionally recorded audit trail.
- Product configuration, request progress, customer sign-up, and audit
  activity are available through authenticated server routes.

## Provider and service readiness

No official identity, CAC, airtime, mobile data, VPN, payment, PIN supplier,
electricity, email, or other service-provider credentials or API specifications
were included. These integrations are **not live**. Provider fulfilment is
disabled in product configuration until an approved provider adapter exists.
Payment records stay unconfirmed until a separately implemented
verified provider event is received. Password-reset delivery is unavailable
until a verified email sender is configured. IPE remains a configurable
category pending its service definition. Government verification, consent
requirements, eligible access, retention periods, and CAC authorization should
be reviewed with the approved providers and a Nigerian privacy/legal adviser
before the platform is used with live personal information.

## Automated checks

Run `npm test` for the encryption, data-validation, duplicate-fingerprint, and
sensitive-data-redaction unit tests.
