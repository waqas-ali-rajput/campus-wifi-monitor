# Smart Campus Wi-Fi Monitoring & Network Health Dashboard

A web application for a university campus. Students and staff run a built-in Wi-Fi speed test from where they are sitting and report connectivity problems. The IT team gets live campus-wide network health, outage detection, a complaint workflow, analytics, and local AI-style insights.

> **Flow:** User selects location → runs speed test → network metrics collected → health score calculated → result stored → dashboard updated → complaint submitted if needed → IT team reviews → analytics updated.

## Quick start

Requirements: **Node.js 20 or newer** (22 LTS recommended). Running the internet speed test requires internet access and sends measurement traffic to Cloudflare’s edge network; Cloudflare may collect test measurements for aggregated connection-quality insights. Campus health tests use the app’s own server and remain separate from off-campus internet tests.

```bash
npm run setup     # install → create database → seed demo data → build the web app
npm start         # serves the API and the web app on one port
```

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
| `npm start` | Run the built app (`apps/server/dist/index.js`, serving `apps/web/dist`) |
| `npm run dev` | API with hot reload on :3000 plus the Vite dev server on :5173 (proxies `/api`) |
| `npm run build` | Build the server bundle and the web app |
| `npm run seed` | Demo data; skips if users exist (`npm run seed -- --force` to wipe and reseed) |
| `npm run reset` | Delete the database, migrate and seed again |
| `npm run simulate` | Post a realistic live speed test every 3 s, so the dashboard moves live |
| `npm run simulate:outage -- --location "Library Floor 2"` | 4 students report *No Internet* and 3 tests fail → an outage opens live |
| `npm run simulate:recover -- --location "Library Floor 2"` | 3 good tests → "Network returns to normal" |
| `npm test` | Unit and integration tests (Vitest): domain rules, API, speed-test engine |
| `npm run test:e2e` | Browser end-to-end flow (Playwright). Run `npm run build` first, and `npx playwright install chromium` once |
| `npm run lint` / `npm run typecheck` | ESLint (including the clean-architecture boundary rule) / TypeScript |

Copy `.env.example` to `.env` to change the port, timezone (`CAMPUS_TZ`), quick speed-test mode, or to enable optional local-LLM rewording of the AI summary (Ollama).

## Vercel disposable demo

This Vercel configuration is **demo-only** and deliberately keeps SQLite unchanged. Vercel Functions use temporary, per-instance storage, so accounts, login sessions, tests, complaints, and settings may reset or differ between requests/instances. Live SSE updates and in-process scheduled refresh jobs are disabled. Do not enter real or sensitive data. For persistent campus use, deploy the single Node server on a host with durable storage or migrate to a shared managed database.

To try the demo, push this repository to GitHub/GitLab, import it in Vercel using this repository root, and set `NODE_ENV=production`, a random `JWT_SECRET` (32+ characters), `TRUST_PROXY_HOPS=1`, and `SERVERLESS_DEMO_MODE=true`. The Vercel build runs `npm run build`; it does not seed the database. Create a temporary admin only if needed, and expect all database contents to disappear when the function instance is recycled. Vercel CLI deployment is not configured until the repository is connected to your Vercel team.

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

It creates `admin@campus.local`, `manager@campus.local`, `it1@campus.local`, `it2@campus.local`, and `student01@campus.local`. Every password is supplied by you, so nothing guessable ships to a public URL. Missing any variable aborts the command before creating anything, and existing accounts are never overwritten — re-running will not reset a password you have changed in the app. On Render, run it from **Shell**; on Vercel, note that its disposable filesystem erases these accounts, so prefer Render for real use.

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
