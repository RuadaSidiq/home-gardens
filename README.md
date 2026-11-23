# Home Gardens

Gardening services marketplace, garden-activities booking and e-commerce platform – built for Ghana first, ready for other countries, currencies and payment providers.

One Next.js application serves five interfaces from one PostgreSQL database:

| Interface | Path | Who |
|---|---|---|
| Public website | `/`, `/services`, `/find-a-gardener`, `/activities`, `/shop`, `/assistant`… | Everyone |
| Customer portal | `/account/*` | Signed-in customers |
| Gardener portal | `/gardener/*` (mobile-first) | Company and independent gardeners |
| Staff / admin | `/admin/*` (permission-gated per module) | Staff roles |
| APIs & webhooks | `/api/*` | Payment providers, scheduler |

## Stack

Next.js 15 (App Router, server actions) · TypeScript · Tailwind CSS · PostgreSQL 16 (Supabase-compatible) via Drizzle ORM · Vitest · Anthropic SDK (garden assistant).

Authentication and authorization are implemented on the server (bcrypt passwords, hashed session tokens in httpOnly cookies, TOTP two-step verification, role → permission RBAC checked in every page and action). This works on Supabase Postgres or any other Postgres. When hosted on Supabase, migrations enable Row Level Security on every table with no permissive policies, so Supabase's auto-generated public Data API cannot read or write application data – all access goes through the server.

## Quick start (local)

```bash
cp .env.example .env            # then set AUTH_SECRET, DATA_ENCRYPTION_KEY, DATABASE_URL
npm install
npm run db:migrate
npm run db:seed                 # reference data + demo content
npm run dev                     # http://localhost:3000
```

Demo accounts (password `Garden2026!`): `admin@homegardens.example` (super admin), `ops@…`, `finance@…`, `store@…`, `kwame.mensah@homegardens.example` (company gardener), `kojo.antwi@example.com` (independent gardener), `nana.addo@example.com` (pending application), `ama@example.com` (customer).

Demo gardener profiles, testimonials and projects are **sample content** – replace them before launch. No transactions, reviews or ratings are seeded; every dashboard figure comes from real records.

For production use `npm run db:seed -- --minimal` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` set: it creates reference data and one super administrator only.

## Tests

```bash
npm test          # resets and seeds a separate database (TEST_DATABASE_URL, default gardens_test)
npm run typecheck
npx eslint src
```

40 tests cover pricing, taxes, coupons, cancellation refunds, commission splits, time zones, TOTP, encryption and file sniffing, plus full workflows against Postgres: booking lifecycle, double-booking prevention (application check + database exclusion constraint + concurrent assignment race), quotes, gardener decline → reassignment, reschedule limits, disputes with partial refunds, payouts, cart persistence and merge, currency conversion, checkout with coupon and tax, stock reservation and release, returns with restock, overselling races, activity seat limits under concurrency, and payment verification rules.

## Key business rules

- **Bookings**: priced services → pay deposit or full → automatic assignment (requested gardener first, else best match by service, area, working hours, leave, existing jobs, daily cap, rating, experience, workload) → independent gardeners accept/decline, company gardeners are assigned directly → before/after photos → customer confirms (balance must be paid) → earnings recorded. Quote and inspection services go through a quote the customer accepts first. Overlapping jobs for one gardener are impossible: a Postgres exclusion constraint backs the application checks.
- **Payments** are never trusted from a browser redirect: the return URL, signed webhooks (Paystack HMAC-SHA512, Stripe v1 signatures) and a reconciliation job all call the provider's verify API, and the payment is applied once under a row lock. Amount and currency must match. Manual bank/MoMo transfers stay pending until finance confirms them against a statement.
- **Money** is stored as integer minor units with its currency. Display prices convert at the latest stored rate; orders snapshot the rate. A double-entry style ledger records gross receipts, refunds, company revenue, gardener and vendor payables, fees, tax and payouts separately.
- **Commission** rules resolve most-specific-first (category + country → category → country → default). Earnings mature after a hold period, then gardeners request payouts (funds reserved until paid or rejected).
- **Stock** is reserved when an order is placed, released if it is cancelled or unpaid after 60 minutes, and can never go negative unless backorders are enabled.

## Configuration

All secrets are environment variables (see `.env.example`). Integrations that are not configured are shown as "not configured" in **Admin → Settings** and are hidden from customers – nothing is faked.

| Area | Variables |
|---|---|
| Payments | `PAYSTACK_SECRET_KEY`, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `HUBTEL_CLIENT_ID/SECRET/MERCHANT_ACCOUNT`, `PAYPAL_CLIENT_ID/SECRET/MODE`, `MANUAL_PAYMENTS_ENABLED`, `MANUAL_PAYMENT_INSTRUCTIONS` |
| Notifications | `SMTP_*` or `RESEND_API_KEY`; `HUBTEL_SMS_*` or `TWILIO_*`; `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| Storage | `STORAGE_DRIVER=local|s3`, `S3_*` (Supabase Storage S3, AWS S3, R2) |
| AI assistant | `ANTHROPIC_API_KEY`, `AI_MODEL` (default `claude-opus-5-5`) |
| Ops | `APP_URL`, `CRON_SECRET`, `ERROR_WEBHOOK_URL` |

Webhook URLs to register with providers: `https://YOUR_DOMAIN/api/webhooks/paystack`, `/api/webhooks/stripe`, `/api/webhooks/hubtel`.

## Deployment

Requirements: Node.js 20+, PostgreSQL 15+ (with the `btree_gist` extension, available on Supabase and most hosts), HTTPS.

**Database (Supabase recommended):** create a project, copy the connection string (use the pooler URI for serverless hosts) into `DATABASE_URL`, run `npm run db:migrate` then `npm run db:seed -- --minimal`. Enable daily backups / point-in-time recovery in Supabase; for other hosts schedule `pg_dump` to off-site storage.

**Option A – Vercel:** import the repository, add the environment variables, deploy. Add a cron job calling `/api/cron/maintenance` every 15 minutes with header `Authorization: Bearer $CRON_SECRET`. Use `STORAGE_DRIVER=s3` (serverless disks are ephemeral).

**Option B – Hostinger Node.js hosting / VPS:** check your plan supports Node.js apps (Business/Cloud web hosting or a VPS). Build with `NEXT_OUTPUT=standalone npm run build`, upload `.next/standalone`, `.next/static` (to `.next/standalone/.next/static`) and `public/`, and start `node server.js` (or `npm start` with PM2 on a VPS, behind Nginx). Add a cron entry: `*/15 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/maintenance`. Local storage works on a single VPS (back up `uploads/`); otherwise use S3.

**Domain (registered at Hostinger):** in hPanel → Domains → DNS, point the domain to your host – for Vercel an `A` record `@ → 76.76.21.21` and `CNAME www → cname.vercel-dns.com` (or use the values Vercel shows); for a Hostinger app, connect the domain in the hosting panel. HTTPS certificates are issued automatically by Vercel / Hostinger (Let's Encrypt). Set `APP_URL=https://yourdomain`.

**Monitoring:** set `ERROR_WEBHOOK_URL` to receive JSON error reports (Slack/Teams incoming webhook or any collector); uptime-check `/` and `/api/cron/maintenance` responses. Security headers and a Content-Security-Policy are set by `next.config.ts` and `src/middleware.ts`.

## Project layout

```
drizzle/                migrations (0001_constraints.sql: exclusion constraint, RLS)
scripts/                migrate, seed, reset
src/db/schema.ts        documented relational schema (75 tables)
src/server/             domain logic: auth, bookings/engine, commerce, payments, finance, activities, notify, ai…
src/app/(site)          public website      src/app/account   customer portal
src/app/gardener        gardener portal     src/app/admin     admin (+ _actions)
src/components          design system (ui/), site, portal, admin
tests/                  Vitest unit + integration tests
```
