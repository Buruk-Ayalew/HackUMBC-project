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
- Employee-count thresholds on the "What if I hire" slider come from these numeric conditions automatically.

3. Run `npm run check:obligations -w server` and add a check for the new rule if it matters for a sample profile.

### Add a county's local rules

1. Add rules with `"jurisdiction": { "level": "county", "name": "Howard County" }` and include `{ "field": "jurisdiction", "op": "match" }` in `conditions` (and in `mightConditions` if used). Use the county name exactly as the Census geocoder gives it (e.g. `"Prince George's County"`, `"St. Mary's County"`). Baltimore City is `"Baltimore City"`.
2. If a local rule **replaces** a statewide one (like a county minimum wage), add the county to the state rule's `jurisdiction.county` `not_in` list.
3. For a town, use `"level": "municipality", "name": "Annapolis"` (the name as shown in MD iMAP, title case).
4. Local tax rates live in `server/data/rules/local-tax-rates.json`, keyed by county. They come from the DLS "County Local Tax Rates" table. Update the whole table when DLS publishes a new year, and update `fiscalYear` and `reviewedOn`.
5. Counties other than Baltimore City and Baltimore County automatically show a "coverage limited" note. Towns always show "We haven't reviewed [Town]'s local code yet."
