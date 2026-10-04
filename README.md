# Smart Campus Wi-Fi Monitoring & Network Health Dashboard

A web application for a university campus. Students and staff run a built-in Wi-Fi speed test from where they are sitting and report connectivity problems. The IT team gets live campus-wide network health, outage detection, a complaint workflow, analytics, and local AI-style insights.

> **Flow:** User selects location → runs speed test → network metrics collected → health score calculated → result stored → dashboard updated → complaint submitted if needed → IT team reviews → analytics updated.

## Quick start

Requirements: **Node.js 20 or newer** (22 LTS recommended) and a **PostgreSQL database — [Neon](https://neon.tech) is the default** (any Postgres 14+ works, including a local one). Running the internet speed test requires internet access and sends measurement traffic to Cloudflare’s edge network; Cloudflare may collect test measurements for aggregated connection-quality insights. Campus health tests use the app’s own server and remain separate from off-campus internet tests.

1. Create a Neon project (free tier is fine). In the Neon console open **Connect**, keep **Connection pooling** on, and copy the connection string (its host contains `-pooler`).
2. Copy `.env.example` to `.env` and paste it as `DATABASE_URL`.
3. Run:

```bash
npm run setup     # install → create tables → seed demo data → build the web app
npm start         # serves the API and the web app on one port
```

The schema is created automatically (from `apps/server/migrations-postgres/`) by `npm run migrate` and again, idempotently, every time the server starts.

Open **http://localhost:3000**. The terminal also prints LAN addresses (for example `http://192.168.1.20:3000`). The internet speed test measures the device’s current connection to Cloudflare; it does not measure MUET Wi-Fi unless the device is physically on campus. Off-campus tests are stored in personal history and do not update campus health. Admins can also show the address as a QR code under **Administration → Share on Wi-Fi**.

### Demo accounts

All demo accounts use the password `Passw0rd!demo`. **Change these before any real use.**

| Email | Role |
|---|---|
| `admin@campus.local` | Administrator |
| `manager@campus.local` | Network / IT Manager |
| `it1@campus.local`, `it2@campus.local` | IT Support Staff |
| `student01@campus.local` … `student12@campus.local` | Student / Staff user |

The sign-in page also has one-click demo-account buttons.

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Install, migrate, seed, build |
| `npm run migrate` | Create/upgrade the Postgres tables in `DATABASE_URL` (safe to re-run) |
| `npm run migrate:data` | One-time copy of an old SQLite file (`data/campus-wifi.db`) into Postgres — see below |
| `npm start` | Run the built app (`apps/server/dist/index.js`, serving `apps/web/dist`) |
| `npm run dev` | API with hot reload on :3000 plus the Vite dev server on :5173 (proxies `/api`) |
| `npm run build` | Build the server bundle and the web app |
| `npm run seed` | Demo data; skips if users exist (`npm run seed -- --force` to wipe and reseed) |
| `npm run reset` | **Wipe all data** in `DATABASE_URL` and seed the demo data again |
| `npm run simulate` | Post a realistic live speed test every 3 s, so the dashboard moves live |
| `npm run simulate:outage -- --location "Library Floor 2"` | 4 students report *No Internet* and 3 tests fail → an outage opens live |
| `npm run simulate:recover -- --location "Library Floor 2"` | 3 good tests → "Network returns to normal" |
| `npm test` | Unit and integration tests (Vitest): domain rules, API, speed-test engine. API tests need `TEST_DATABASE_URL` (see below) and are skipped without it |
| `npm run test:e2e` | Browser end-to-end flow (Playwright). Needs `E2E_DATABASE_URL` (a disposable database — it is wiped and re-seeded). Run `npm run build` first, and `npx playwright install chromium` once |
| `npm run lint` / `npm run typecheck` | ESLint (including the clean-architecture boundary rule) / TypeScript |

`.env` also controls the port, timezone (`CAMPUS_TZ`), quick speed-test mode, and optional local-LLM rewording of the AI summary (Ollama).

## Database (Neon Postgres)

All data lives in the Postgres database named by `DATABASE_URL`, so every server instance — your laptop, Render, Vercel functions — shares the same accounts, tests and complaints.

- **Which connection string:** use Neon's *pooled* string (`…-pooler.…neon.tech`) for the app. Each process opens at most `PG_POOL_MAX` connections (default 10; Vercel functions use 3).
- **Schema changes:** add a new numbered file to `apps/server/migrations-postgres/` (e.g. `003_something.sql`). It is applied once, in order, and recorded in the `schema_migrations` table.
- **Neon autosuspend:** a server that is running 24/7 checks the database every few seconds (live updates and scheduled jobs), which keeps the Neon compute awake. On Neon's free plan that uses compute hours continuously; Vercel (no background jobs) lets it sleep between visits.
- **Branches:** a Neon branch is a cheap full copy of the database — handy for trying `npm run reset` or a migration without touching real data.

### Moving existing SQLite data to Neon

If you have been running the earlier SQLite version, copy its data across once:

```bash
DATABASE_URL='postgresql://…' npm run migrate:data
# a different file: SQLITE_PATH=backups/old.db npm run migrate:data
```

It creates the tables, copies every table with the original IDs (so existing links and logins keep working), keeps your saved threshold settings, checks that every row count matches, and only then commits — a failure leaves Postgres untouched. It refuses to run if the Postgres database already has users or locations; add `-- --force` to wipe it and copy again. The SQLite file is opened read-only and never modified.

### Running the API tests

The integration tests need a Postgres database they can create schemas in. They never use `DATABASE_URL`: set `TEST_DATABASE_URL` to a **non-pooled** connection string (a Neon dev branch, or a local Postgres). Each run creates a throwaway schema and drops it afterwards.

```bash
TEST_DATABASE_URL='postgresql://…' npm test
```

## Vercel

Vercel runs the API as a serverless function backed by the same Neon database, so data is persistent and shared across instances. Live SSE updates and the in-process scheduled jobs are disabled there (functions are short-lived); statuses are refreshed when a function instance starts.

Import the repository in Vercel (root of this repo) and set `NODE_ENV=production`, `DATABASE_URL` (Neon pooled string — or use Vercel's Neon integration, which sets it for you), a random `JWT_SECRET` (32+ characters), and `TRUST_PROXY_HOPS=1`. Live updates are switched off automatically on Vercel, so no extra variable is needed. The schema is created on first request. The build does not seed data; create accounts with `bootstrap-admin` (below) from your own machine with the same `DATABASE_URL`.

## Creating the demo accounts on a fresh deployment

A new deployment starts with an empty database, so `admin@campus.local` and the other demo accounts do not exist yet. Create them with the one-time bootstrap command instead of seeding publicly-known passwords:

```bash
BOOTSTRAP_ADMIN_PASSWORD='…'    \
BOOTSTRAP_MANAGER_PASSWORD='…'  \
BOOTSTRAP_IT_PASSWORD='…'       \
BOOTSTRAP_IT2_PASSWORD='…'      \
BOOTSTRAP_STUDENT_PASSWORD='…'  \
npm run bootstrap-admin
```

It creates `admin@campus.local`, `manager@campus.local`, `it1@campus.local`, `it2@campus.local`, and `student01@campus.local`. Every password is supplied by you, so nothing guessable ships to a public URL. Missing any variable aborts the command before creating anything, and existing accounts are never overwritten — re-running will not reset a password you have changed in the app.

To also fill the dashboards with 14 days of demo speed tests, complaints, and insights, run this afterwards:

```bash
npm run seed -- --accounts
```

This reuses the accounts created above and leaves their passwords untouched. Because the data lives in Neon, you can run both commands from your own machine (with the production `DATABASE_URL` in `.env`) or from Render's **Shell**.

## Five-minute demo script

1. Sign in as **student01**, consent to the Cloudflare measurement, and select **Run internet speed test**. Review the provider-labeled download, upload, latency, and personal history result.
2. While connected to campus Wi-Fi, open **Campus Wi-Fi test**, select the room, and run a local test; then select **Report a problem**. The campus test is attached and the category is suggested from what you type.
3. Sign out, then sign in as **it1**. The dashboard shows the KPIs, the campus heatmap, insights ("Possible network problem detected in Library Floor 2."), the 12 PM–2 PM summary, and the inspect-first ranking.
4. Open the complaint and move it through **Reviewed → Assigned (to yourself) → In Progress (add a note) → Resolved**. The student receives a notification.
5. Keep the dashboard open and run `npm run simulate:outage -- --location "Library Floor 2"`. The outage toast, the KPI change and the heatmap update arrive live. Then run `npm run simulate:recover -- --location "Library Floor 2"`.
6. Sign in as **manager** for **Analytics** (speed and ping by location, by hour and day, complaints by building, most problematic locations, peak periods, 24 h forecast) and **Compare & reports** (building comparison, recurring problems, IT activity, CSV downloads).
7. Sign in as **admin**: create an IT staff user, add a location (with live map preview), and change a health threshold to see the sample score update instantly.

## Documentation

- `docs/PROJECT_STRUCTURE.md` (also `.docx` and `.pdf`): the project explanation document required by the brief.
- `docs/ARCHITECTURE.html`: the build blueprint this implementation follows.

## A note on what speed tests measure

The main speed test uses Cloudflare’s `@cloudflare/speedtest` browser engine to measure throughput and latency to Cloudflare’s edge network. Values describe the measured path to that provider and are not a provider-independent guarantee of ISP performance. Cloudflare documents that it collects completed test measurements for aggregated connection-quality insights; the app disables the package’s optional result-logging endpoints and asks for consent before generating measurement traffic. The web page therefore needs outbound access to `speed.cloudflare.com`.

These internet measurements are stored separately under the signed-in user with MUET main campus as context and an explicit off-campus scope. They do not create room-level results or affect campus health, outages, or analytics. The **Campus Wi-Fi test** route retains the manual room selector and measures to the app server; only those room-specific tests feed campus health. The campus status map uses OpenStreetMap tiles and shows pins only after an administrator enters verified latitude/longitude for a location; unverified locations remain available in grid view. OSM tiles require internet access and visible attribution. Browser GPS is not collected.
