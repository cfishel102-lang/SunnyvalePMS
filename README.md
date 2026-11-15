# SunnyvalePMS

Cloud reservation software for RV parks and campgrounds. Each property brings its own map, rates and brand. First property (beta tester): **RV at Olympic**.

## What is here

| Area | Where | What it does |
| --- | --- | --- |
| Guest booking | `/book/rv-at-olympic` | Search dates, pick a site, pay, get a confirmation. Guests can change dates or cancel themselves. |
| Staff | `/admin` | Dashboard, calendar, reservations, sites, pricing, reports, settings. |
| Open API | `/api/v1` | Availability, reservations and reports for other systems. Description at `/api/v1/openapi.json`. |
| MCP server | `/api/mcp` | The same operations for AI assistants. |

Local staff login: `owner@example.com` / `campground`. Online, the login comes from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

The site list comes from the real park map (`prisma/maps`). Rates, tax rate and reservations are placeholder sample data (`prisma/seed.ts`). Site lengths are not entered yet.

## Setting up a new property

The first step is always the map: **Map → upload**. The system reads the colour key and the site numbers and proposes the site types and sites. You check the markers, enter rates, and import. Automatic reading needs `ANTHROPIC_API_KEY` in `.env`.

Then **Brand → upload the brand deck** (PDF). The colour codes and font names in it are suggested for review; logos are uploaded separately. The brand styles both the staff side and the guest booking pages. A property without a brand uses the SunnyvalePMS look.

The Brand page also gives each property a booking link and a date-picker snippet to embed on its own website.

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

## Putting it online (Vercel)

1. In Vercel, import this GitHub repository as a new project. Before deploying, add these environment variables:
   - `AUTH_SECRET`: any long random text (40+ characters). Keeps staff sign-in secure.
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: the first staff login.
2. In the project's **Storage** tab, add a Postgres database (Neon) and connect it to the project.
3. Deploy (or redeploy). The build creates the tables and, on a new database only, loads RV at Olympic with sample reservations.

Every later push to `main` redeploys automatically and never overwrites existing data.

## How the code is organised

- `prisma/schema.prisma`: the data model (organizations, properties, sites, reservations, payments).
- `src/lib/pricing.ts`: availability and pricing, including dynamic pricing.
- `src/lib/reservations.ts`: create, change, cancel.
- `src/lib/payments.ts`: Stripe checkout and refunds.
- `src/lib/mapImport.ts`: reading a park map and creating sites from it.
- `src/lib/brand.ts`: per-property colours, fonts and logo.
- `src/lib/reports.ts`: occupancy, revenue, ADR, RevPAR.
- `src/lib/api.ts`: the operations shared by the REST API and the MCP server.
- `src/app/book`: guest pages. `src/app/admin`: staff pages.

The database itself blocks two active reservations on the same site for overlapping nights.

## Not built yet

Stripe live-mode testing and webhook, confirmation emails, dragging map markers to correct them, custom domains per property, reading logos out of a brand deck, Expedia / Booking.com / Airbnb
connections, Google Analytics and Ads, saved custom reports, multiple staff users and roles,
monthly billing for long-term guests (currently one total per reservation), a property switcher.
