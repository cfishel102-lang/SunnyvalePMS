# Campground reservations

Cloud reservation software for RV parks and campgrounds. First property: **RV at Olympic**.

## What is here

| Area | Where | What it does |
| --- | --- | --- |
| Guest booking | `/book/rv-at-olympic` | Search dates, pick a site, pay, get a confirmation. Guests can change dates or cancel themselves. |
| Staff | `/admin` | Dashboard, calendar, reservations, sites, pricing, reports, settings. |
| Open API | `/api/v1` | Availability, reservations and reports for other systems. Description at `/api/v1/openapi.json`. |
| MCP server | `/api/mcp` | The same operations for AI assistants. |

Sample staff login: `owner@example.com` / `campground`. **Change this before real use.**

All sites, rates, tax rate and reservations are placeholder sample data (`prisma/seed.ts`).

## Running it

Needs Node 22 and PostgreSQL 16.

```bash
cp .env.example .env        # then edit the database address
npm install
npx prisma migrate deploy   # create the tables
npm run seed                # load RV at Olympic with sample data
npm run build && npm start  # http://localhost:3000
```

Payments run in demo mode (no real charges) until `STRIPE_SECRET_KEY` is set in `.env`.

## How the code is organised

- `prisma/schema.prisma`: the data model (organizations, properties, sites, reservations, payments).
- `src/lib/pricing.ts`: availability and pricing, including dynamic pricing.
- `src/lib/reservations.ts`: create, change, cancel.
- `src/lib/payments.ts`: Stripe checkout and refunds.
- `src/lib/reports.ts`: occupancy, revenue, ADR, RevPAR.
- `src/lib/api.ts`: the operations shared by the REST API and the MCP server.
- `src/app/book`: guest pages. `src/app/admin`: staff pages.

The database itself blocks two active reservations on the same site for overlapping nights.

## Not built yet

Stripe live-mode testing and webhook, confirmation emails, map upload, Expedia / Booking.com / Airbnb
connections, Google Analytics and Ads, saved custom reports, multiple staff users and roles,
monthly billing for long-term guests (currently one total per reservation), a property switcher.
