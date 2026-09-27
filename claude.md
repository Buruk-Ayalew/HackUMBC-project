# CLAUDE.md: RegWise

This file gives Claude the context it needs to work in this repository. Read it before making changes.

## What this project is

RegWise is a web app that helps Maryland small businesses stay compliant. An owner logs in, enters their business details and address, and the app shows:

1. **Obligations**: what the business must do now (registrations, filings, payments, postings, deadlines), based on its details and location.
2. **Regulatory Radar**: new and upcoming law and regulation changes, sorted by whether they affect this business.
3. **Local Risk**: construction, road work, and permitted projects near the business's address.

It must work for **any Maryland business and address**, not one hard-coded demo. Baltimore City and Baltimore County have the deepest local data; everywhere else works with clear "coverage limited" labels.

It's an 18-hour hackathon project by 3 people, but it must be a **working product**: real data sources, real logic, graceful fallbacks. Current date context: late September 2026.

## Tech stack

- TypeScript everywhere
- Backend: Node.js 20+, Express, run with `tsx`, port **3001**
- Frontend: React + Vite + React Router + Tailwind CSS, port **5173**
- Vite proxies `/api/*` to `http://localhost:3001`. The frontend always calls relative URLs (`fetch("/api/radar")`).
- Auth: `express-session` + bcrypt, users in `server/data/users.json`
- Storage: JSON files in `server/data/` (no database)
- Scheduled jobs: `node-cron` in `server/src/jobs/`
- Maps: Leaflet via `react-leaflet`, OpenStreetMap tiles with attribution
- HTML parsing: `cheerio`; PDFs: `pdf-parse`; geo math: `@turf/*`; validation: `zod`; calendar export: `ics`
- LLM: Anthropic Claude API, model `claude-sonnet-5`, via `@anthropic-ai/sdk`, **backend only**

## Commands

```bash
npm install          # from repo root, installs server and client
npm run dev          # runs server (3001) and client (5173) together
npm run dev:server   # backend only
npm run dev:client   # frontend only
npm run build        # production build of both
```

Secrets go in `server/.env` (never commit): `ANTHROPIC_API_KEY`, `LEGISCAN_API_KEY`, `SESSION_SECRET`.

Test login: **demo@regwise.test / demo1234** (seeded on server start with the Baltimore City restaurant profile).

## Repository structure

```
shared/types.ts                 # types shared by server AND client
server/
  src/
    index.ts                    # Express app, session, mounts routers under /api
    middleware/auth.ts          # requireAuth
    lib/
      profile.ts                # getProfileForUser, saveProfile
      jsonStore.ts              # readJson / writeJson (atomic writes)
      jurisdiction.ts           # address → county / Baltimore City / municipality
      obligations/              # rules engine
      radar/                    # Regulatory Radar
      risk/                     # Local Risk
    routes/                     # auth, profile, obligations, radar, localRisk
    jobs/                       # node-cron refresh jobs
  data/
    users.json, profiles.json, sample-profiles.json
    rules/                      # obligation rules (JSON) + local-tax-rates.json
    cache/                      # cached results from every external source
client/src/
  App.tsx, main.tsx, api.ts
  pages/                        # Welcome, Login, Setup, Settings, Dashboard,
                                # Obligations, WhatIf, Calendar, Radar, LocalRisk
  components/
```

## Team responsibilities

Each person owns one module end to end: data, backend logic, routes, and page.

### Person 1: Onboarding and Obligations (plus the shared skeleton)

**Owns the foundation everyone builds on, and the user's path from first visit to results.**

| Feature | What it does | Files |
|---|---|---|
| Shared skeleton | Repo structure, Express app, sessions, `requireAuth`, Vite proxy, React Router shell, navigation, `shared/types.ts`, sample profiles. **Due by hour 2.** | `server/src/index.ts`, `middleware/auth.ts`, `lib/jsonStore.ts`, `client/src/App.tsx`, `api.ts` |
| Welcome page | Public landing page explaining the three categories, with a test-login note | `pages/WelcomePage.tsx` |
| Log in | Email/password login, seeded test account, logout, `/api/auth/me` | `routes/auth.ts`, `pages/LoginPage.tsx` |
| Intake form | First-time step-by-step setup: business, location, four employee counts, operations flags, review | `pages/SetupPage.tsx`, `routes/profile.ts`, `lib/profile.ts` |
| Settings page | Edit business details later; re-runs lookup and results on save | `pages/SettingsPage.tsx` |
| Address to jurisdiction lookup | Census geocoder + MD iMAP boundaries → county / Baltimore City / municipality, confirmed by the user | `lib/jurisdiction.ts` |
| Obligations engine and results page | Evaluates JSON rules against the profile → Affects you / Might / Doesn't apply, with reasons, actions, deadlines, sources | `lib/obligations/`, `data/rules/`, `routes/obligations.ts`, `pages/ObligationsPage.tsx` |
| Headcount "what if I hire" view | Slider showing which obligations switch on as the business grows | `pages/WhatIfPage.tsx` |
| Compliance calendar with export | All deadlines in one view; .ics and Google Calendar export | `pages/CalendarPage.tsx` |
| Dashboard | Landing page after login with summary cards for all three modules | `pages/DashboardPage.tsx` |

### Person 2: Regulatory Radar

**Owns everything about new and upcoming changes to laws and regulations.**

| Feature | What it does | Files |
|---|---|---|
| Maryland Register fetcher | Latest issues → proposed/final regulations, citations, comment deadlines | `lib/radar/mdRegister.ts` |
| Bill fetcher | LegiScan bills with status and effective dates | `lib/radar/legiscan.ts` |
| Agency news checker | Detects new items on Labor, FAMLI, Comptroller, SDAT news pages | `lib/radar/agencyNews.ts` |
| Normalizer | Combines all sources into `RadarItem[]` | `lib/radar/index.ts` |
| Relevance sorting | Claude sorts each item against the profile, with a reason | `lib/radar/classify.ts` |
| Radar page | Grouped results, filters, "Check now", cached-data banner | `routes/radar.ts`, `pages/RadarPage.tsx` |
| Comment periods and hearings | "Have your say" panel, soonest deadline first | `pages/RadarPage.tsx` |
| Daily refresh | node-cron job at 6:00 AM | `jobs/radarJob.ts` |

### Person 3: Local Risk

**Owns everything about what's happening physically around the business.**

| Feature | What it does | Files |
|---|---|---|
| Baltimore City permits | ArcGIS radius query on the city permits layer | `lib/risk/baltimoreCity.ts` |
| Baltimore County permits | ArcGIS radius query on the county permits layer | `lib/risk/baltimoreCounty.ts` |
| State road projects | MDOT SHA projects so every Maryland address gets coverage | `lib/risk/mdotSha.ts` |
| Normalizer | Combines sources into `RiskItem[]`, maps permit types to categories | `lib/risk/normalize.ts` |
| Radius search | Picks sources by jurisdiction, calculates distances | `lib/risk/search.ts` |
| Risk scoring | Rule-based High / Medium / Low with reasons | `lib/risk/score.ts` |
| "New nearby" tracking | Flags items not seen before; count endpoint for the dashboard | `lib/risk/seen.ts` |
| Local Risk page | Map + list, radius selector, filters, coverage note | `routes/localRisk.ts`, `pages/LocalRiskPage.tsx` |
| 12-hour refresh | node-cron job | `jobs/riskJob.ts` |

### Shared (everyone)

- **Hours 0–2:** agree on `BusinessProfile` and the sample profiles; Person 1 pushes the skeleton.
- **Hours 14–16:** connect modules, run all 5 sample profiles end to end, fix integration bugs.
- **Hours 16–18:** Person 1 polishes and adds disclaimers, Person 2 refreshes all caches, Person 3 leads pitch rehearsal and records a backup video.

### Shared files (coordinate before editing)

`shared/types.ts`, `server/src/index.ts`, `client/src/App.tsx`, `client/src/api.ts`, `package.json` files. Keep changes small, and tell the team in chat before pushing.

## The shared contract: BusinessProfile

`BusinessProfile` in `shared/types.ts` is the contract between modules. Person 1 creates and saves it; Radar and Local Risk only read it. **Do not change its shape without team agreement.**

Key points:
- `jurisdiction.isBaltimoreCity` distinguishes Baltimore City (Census GEOID 24510) from Baltimore County (GEOID 24005). Many "Baltimore, MD" mailing addresses are actually in Baltimore County. Always trust the GEOID, never the city name in the address.
- There are **four separate employee counts**, because each law counts differently:
  - `employees.totalAllStates`: all employees under the tax ID, all states (FAMLI)
  - `employees.inMaryland`: working mainly in Maryland (sick leave, parental leave)
  - `employees.fullTimeInMaryland`: full-time in Maryland (state ban-the-box)
  - `employees.coveredByFMLA`: "yes" | "no" | "unsure"
- Any rule that depends on an "unsure" answer must return **"might"**, never "affects" or "not_applicable".

## Route conventions

- Every module route uses `requireAuth`, reads `req.session.userId`, loads the profile with `getProfileForUser`, and returns JSON.
- Mount paths: `/api/auth`, `/api/profile`, `/api/jurisdiction`, `/api/obligations`, `/api/radar`, `/api/local-risk`.
- Validate request bodies and LLM output with `zod`.
- Errors return `{ error: string }` with a sensible status code. Never crash on a failed external source.

## Non-negotiable rules

1. **Accuracy over coverage.** Never invent numbers, dates, rates, or requirements. If data is missing, say so ("Coverage limited" / "No data available").
2. **Every item links to its official source.** Rules store `sourceUrl` and `reviewedOn`.
3. **Footer on every page:** "Information, not legal advice."
4. **Estimates are labeled as estimates.** Local Risk levels are rule-based (distance, project type, timing). No percentages, no foot-traffic or revenue numbers.
5. **Maryland Register text:** licensing restricts commercial resale. Show our own short summaries plus a link; never republish full regulation text.
6. **All external calls happen on the backend.** Never call outside APIs or Claude from the browser.
7. **Every external fetch has a cached fallback** in `server/data/cache/`. If a live fetch fails, serve the cache and show "Showing saved results from [date]."
8. **Be polite to government sites:** max ~1 request/second, descriptive User-Agent, cache aggressively. If a site returns 403, skip it and report it as unavailable. Do not try to bypass blocking.
9. **Rules are data, not code.** Obligations come from `server/data/rules/*.json` evaluated by the engine. Never hard-code logic for a specific business.

## Data sources

| Purpose | Source |
|---|---|
| Geocoding + county | U.S. Census Geocoder (geographies endpoint, free, no key) |
| Municipal boundaries | MD iMAP "Maryland Political Boundaries - Municipal Boundaries" (ArcGIS FeatureServer) |
| Local tax rates | DLS 2026 County Local Tax Rates PDF (dls.maryland.gov) |
| Proposed/final regulations | Maryland Register, `https://dsd.maryland.gov/MDRIssues/{VVII}/Assembled.aspx` (e.g. 5319) |
| Bills | LegiScan API (`LEGISCAN_API_KEY`) + MGA effective-date lists |
| Agency news | MD Labor, FAMLI, Comptroller, SDAT news pages |
| Baltimore City permits | EGIS FeatureServer `Housing/DHCD_Open_Baltimore_Datasets/FeatureServer/3` (native WKID 2248; always use `inSR=4326&outSR=4326`) |
| Baltimore County permits | opendata.baltimorecountymd.gov (ArcGIS Hub, updated monthly) |
| State road projects | MDOT SHA data via data.imap.maryland.gov (verify before relying on it) |

For any ArcGIS layer, read its real field names with `?f=json` first. **Do not guess field names.** Paginate at 1,000 records.

## Testing

Test every module against all 5 sample profiles in `server/data/sample-profiles.json`:
1. Restaurant, Baltimore City, 14 employees, tipped staff, serves alcohol
2. Salon, Montgomery County (Rockville), 6 employees
3. One-person LLC, Frederick County (City of Frederick), 0 employees
4. Hotel, Worcester County (Ocean City), 40 employees, rents lodging
5. Contractor, Baltimore County, 60 employees, sells to government

Must hold:
- The Baltimore City restaurant at 14 employees does **not** get the FAMLI employer share; at 15 it does.
- The Montgomery salon gets the Montgomery minimum wage, not the $15.00 state rate.
- The Frederick one-person LLC gets the SDAT annual report and no employer rules.
- County-only items are "not_applicable" for businesses in other counties.
- Addresses outside Baltimore show "coverage limited" notes and never crash.
- With the network off, every page still loads from cache.

## Rules for Claude (agentic working rules)

### Before writing code
- **Know whose feature it is.** Check which module the task belongs to (see Team responsibilities) and work only in that module's files unless told otherwise.
- **Read before you write.** Open the files you'll change and anything they import. Check `shared/types.ts` before creating new types.
- **Plan non-trivial work first.** For anything larger than a small fix, state the plan (files to create or change, approach) in a few lines, then build.
- **Ask when a decision is the team's to make**, such as changing `BusinessProfile`, adding a dependency others will need, or changing a route contract. Otherwise make sensible choices and say what you chose.

### While working
- **Stay in scope.** Don't refactor, rename, or "clean up" code outside the task, especially in another person's module.
- **Never change shared contracts silently.** If `BusinessProfile`, a shared type, or an API response shape must change, stop and flag it for the team.
- **Verify external data sources before relying on them.** Fetch the URL, read the real response, and check field names (`?f=json` for ArcGIS). Never assume an endpoint's shape or guess field names.
- **Never fabricate data.** No made-up rules, rates, dates, permits, or sample results presented as real. Test fixtures go in clearly named files (e.g. `*.fixture.json`) and are never shown to users as real data.
- **If a source is blocked or down,** use the cache, report it as unavailable, and move on. Do not work around blocking (no header spoofing, proxies, or scraping via other routes).
- **Keep secrets secret.** Read keys from `server/.env`. Never hard-code, log, or commit them, and never send them to the client.
- **Build in small steps.** Get one piece working end to end (fetch → normalize → route → page) before adding the next.

### Before saying a task is done
- **Run it.** Start the app, hit the route, load the page. Code that hasn't been run isn't done.
- **Test with all 5 sample profiles** for anything that depends on the business profile.
- **Check the failure path:** turn off the network or break the source URL and confirm the cached fallback works.
- **Check the type build** (`tsc --noEmit`) passes for both server and client.
- **Report plainly:** what was built, what was tested, anything that doesn't work yet, and any assumptions made. Don't claim something works if it wasn't verified.

### Git and safety
- Commit small, focused changes with clear messages (e.g. `radar: add LegiScan fetcher with 12h cache`).
- Pull before starting work and before pushing; resolve conflicts in shared files carefully.
- **Ask before anything destructive or hard to undo:** deleting files, force-pushing, rewriting history, wiping `server/data/`, or changing another person's module.
- Don't commit `server/.env`, `node_modules/`, or large generated files. Cache files in `server/data/cache/` may be committed right before the demo as the offline fallback.

### Accuracy on compliance content
- Every obligation rule must have a `sourceUrl` and a `reviewedOn` date. If you add or change a rule, say which source you checked.
- When a rule's applicability is uncertain, the result is **"might"**, never a confident "affects" or "not_applicable".
- Summaries must be in our own words. Never paste regulation or statute text into the app.

## Style

- Plain English in all user-facing text. Short sentences, no legalese.
- Small, focused files. Keep business logic in `server/src/lib/`, not in route handlers.
- Prefer `Promise.allSettled` when combining multiple sources so one failure doesn't break the rest.
- Mobile-friendly layouts (the map stacks above the list on small screens).