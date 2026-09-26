# CivicPulse MD

Helps Maryland small businesses see what they owe (Obligations), what's changing (Regulatory Radar), and what's happening near them (Local Risk).

Information, not legal advice.

## Run it

```bash
npm install          # from the repo root; installs server and client
cp server/.env.example server/.env   # then set SESSION_SECRET (and API keys)
npm run dev          # API on :3001, web app on http://localhost:5173
```

Test login: **demo@civicpulse.test / demo1234**. It is seeded on server start with the Baltimore City restaurant profile.

Other scripts: `npm run typecheck`, `npm run build`, `npm run check:obligations -w server` (runs the rules engine against all 5 sample profiles and checks the expected results).

## Obligations: how rules work

Obligations are **data, not code**. Every `server/data/rules/*.json` file (except `local-tax-rates.json`) holds an array of rules. The engine (`server/src/lib/obligations/engine.ts`) evaluates every rule against the business profile and returns **Affects you**, **Might affect you**, or **Doesn't apply**, with a reason for each condition. Rules are validated on load; an invalid rule is skipped with a warning in the server log.

### Add a new rule

1. Check the official source first. Never invent numbers, dates, or requirements.
2. Add an object to the right file in `server/data/rules/` (e.g. `state-employment.json`):

```json
{
  "id": "unique-kebab-id",
  "title": "Short action-style title",
  "category": "employment",
  "jurisdiction": { "level": "state" },
  "conditions": [{ "field": "employees.inMaryland", "op": "gte", "value": 15 }],
  "summary": "Plain-English summary in our own words (1-2 sentences).",
  "action": "What the business needs to do.",
  "deadlines": [{ "label": "What is due", "date": "2027-04-15" }],
  "sourceUrl": "https://official.source/page",
  "sourceName": "Agency: Page name",
  "reviewedOn": "2026-09-26"
}
```

- `category`: `employment`, `tax`, `registration`, `licensing`, `posting`, or `privacy`.
- `conditions`: **all** must pass for "Affects you". The field is any dotted profile path.
  - Numbers: `{ "field": "employees.totalAllStates", "op": "gte" | "lte" | "eq", "value": 15 }` or `"op": "between", "value": [15, 49]`
  - Yes/no or text: `{ "field": "flags.tippedEmployees", "op": "is", "value": true }`
  - Lists: `{ "field": "entityType", "op": "in" | "not_in", "value": ["llc", "corporation"] }`
  - Location: `{ "field": "jurisdiction", "op": "match" }` checks the rule's own `jurisdiction`.
- `mightConditions` (optional): if the main conditions fail but these pass, the result is "Might affect you".
- `statusWhenMet` (optional): use `"might"` when the profile can't decide the question (e.g. the privacy act), or `"not_applicable"` for items that no longer apply (e.g. the federal BOI report).
- Any **"Not sure"** answer a rule depends on (e.g. FMLA coverage) automatically makes the result "might".
- `summary` and `action` can use `{{county}}`, `{{municipality}}`, `{{admissionsRate}}`, and `{{hotelRate}}`.
- Filing schedule fields (all optional, shown in the Obligations table and calendar):
  - `agency`: who you file with (rows are grouped by it), e.g. `"Comptroller of Maryland"`.
  - `frequency`: `once`, `ongoing`, `every_payroll`, `monthly`, `quarterly`, `yearly`, `every_2_years`, or `varies`, plus an optional `frequencyNote`.
  - `recurring`: repeating due dates, e.g. `{ "every": "quarter", "day": "last", "label": "Form 941, {period}" }`, `{ "every": "month", "day": 15, ... }`, or `{ "every": "year", "month": 4, "day": 15, ... }`. `{period}` becomes "Q3 2026", "September 2026", or "2027". Add `startsOn` for filings that begin later. Dates on weekends or federal holidays move to the next business day automatically.
  - `filingUrl` / `filingSiteName`: the portal where the filing is actually done.
- Employee-count thresholds on the "What if I hire" slider come from these numeric conditions automatically.

3. Run `npm run check:obligations -w server` and add a check for the new rule if it matters for a sample profile.

### Add a county's local rules

1. Add rules with `"jurisdiction": { "level": "county", "name": "Howard County" }` and include `{ "field": "jurisdiction", "op": "match" }` in `conditions` (and in `mightConditions` if used). Use the county name exactly as the Census geocoder gives it (e.g. `"Prince George's County"`, `"St. Mary's County"`). Baltimore City is `"Baltimore City"`.
2. If a local rule **replaces** a statewide one (like a county minimum wage), add the county to the state rule's `jurisdiction.county` `not_in` list.
3. For a town, use `"level": "municipality", "name": "Annapolis"` (the name as shown in MD iMAP, title case).
4. Local tax rates live in `server/data/rules/local-tax-rates.json`, keyed by county. They come from the DLS "County Local Tax Rates" table. Update the whole table when DLS publishes a new year, and update `fiscalYear` and `reviewedOn`.
5. Counties other than Baltimore City and Baltimore County automatically show a "coverage limited" note. Towns always show "We haven't reviewed [Town]'s local code yet."

## Regulatory Radar

The Radar (`/radar`) pulls new and upcoming Maryland law and regulation changes from four sources. Gemini then sorts each one for the logged-in business into **Affects you**, **Might affect you** or **Doesn't apply**.

| Source | Code | Cache file | Refreshed |
|---|---|---|---|
| Maryland Register (latest issue + 2 previous) | `server/src/lib/radar/mdRegister.ts` | `md-register.json` | 24 h |
| General Assembly effective-date lists (enacted bills, July + October 2026) | `server/src/lib/radar/mgaChapters.ts` | `mga-effective-dates.json` | 24 h |
| LegiScan bills (needs `LEGISCAN_API_KEY`) | `server/src/lib/radar/legiscan.ts` | `legiscan.json` | 12 h |
| Agency news (Labor, FAMLI, Comptroller, SDAT) | `server/src/lib/radar/agencyNews.ts` | `agency-news.json` | 24 h |

All cache files live in `server/data/cache/`. The combined list is saved to `radar-items.json`. Gemini's sorting results are saved to `radar-classifications.json`, keyed by item and by the profile fields that matter, so each business pays for an item only once. If a live fetch fails, the saved copy is served and the page says "Showing saved results from [date]." Sorting uses Gemini through **Google Cloud Vertex AI**, so it's billed to GCP project `project-79cc0670-01b4-43ca-94d` (see `server/src/lib/gemini.ts` and `server/.env.example`). Requests are limited to `GEMINI_RPM` per minute (default 30), with 25 items per request. Sorting runs in the background: unsorted items show as "Might affect you" and the page refreshes itself until sorting finishes. Without working Google Cloud credentials, every item stays "Might affect you" with a note.

**One-time local setup for Vertex AI:**
```bash
brew install --cask google-cloud-sdk        # or https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project project-79cc0670-01b4-43ca-94d
gcloud auth application-default login       # creates the credentials the server uses
gcloud auth application-default set-quota-project project-79cc0670-01b4-43ca-94d
gcloud services enable aiplatform.googleapis.com
```
Your Google account needs the **Vertex AI User** role (`roles/aiplatform.user`) on the project. On a server, use a service account with that role and set `GOOGLE_APPLICATION_CREDENTIALS` to its JSON key file instead.

### Refreshing data

- **In the app:** click **Check now** on the Radar page. It calls `POST /api/radar/refresh`, which re-fetches every source.
- **Automatically:** `server/src/jobs/radarJob.ts` runs daily at 6:00 AM America/New_York. It refreshes all sources and pre-sorts items for every saved profile. On server start it also warms up stale sources in the background.
- **Before the demo:** log in, click **Check now**, then commit `server/data/cache/*.json` so the app works offline.
- **Testing a sample profile (temporary, remove before the demo):** `GET /api/radar?profileId=sample-salon-rockville`. This only works when `NODE_ENV` is not `production`.

### Adding an agency news source

1. Open the agency's news page in a browser. Make sure it loads without being blocked.
2. Find a CSS selector that matches only the news links (use your browser's dev tools).
3. Add an entry to `server/data/radar/agency-news-sources.json`:
   ```json
   { "id": "md-example", "agency": "Maryland Example Agency", "url": "https://example.maryland.gov/news/", "linkSelector": "ul.news a", "maxItems": 10 }
   ```
4. Click **Check now**. Dates are picked up automatically when they appear next to the link (e.g. `September 18, 2026` or `09/18/2026`) or in the link URL. If nothing matches, the server logs a warning and the source is listed as unavailable. If a site returns HTTP 403, it's skipped and reported. We never try to get around a block.

When MGA publishes a new effective-date list (e.g. `2027rs-effective-dates-january.pdf`), update `SESSION` and `LISTS` in `mgaChapters.ts`.
