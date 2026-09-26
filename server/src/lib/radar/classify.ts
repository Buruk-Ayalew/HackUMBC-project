// Relevance sorting with Gemini (via Vertex AI): RadarItem[] + BusinessProfile -> RadarResult[].
// Results are cached per item + the profile fields that matter, so each
// business only pays for items it hasn't seen yet.
//
// Sorting runs in the background through a rate limiter (GEMINI_RPM). Callers can wait a bounded time and
// get partial results; unsorted items show as "might" until sorting finishes.

import { createHash } from "node:crypto";
import { z } from "zod";
import type { BusinessProfile, RadarItem, RadarResult } from "../../../../shared/types.js";
import { GeminiApiError, ThinkingLevel, generateText } from "../gemini.js";
import { dataPath, readJson, writeJson } from "../jsonStore.js";
import type { RadarItemInternal } from "./common.js";

const GEMINI_RPM = Number(process.env.GEMINI_RPM) || 30;
const BATCH_SIZE = 25;
const PARALLEL_BATCHES = 5;
const MAX_RETRIES = 3;
const CACHE_FILE = dataPath("cache", "radar-classifications.json");
const FALLBACK_REASON = "Automatic sorting unavailable, review manually.";
const PENDING_REASON = "Still sorting this item. Check back in a few minutes.";

const SYSTEM_PROMPT = `You sort Maryland regulatory changes by whether they apply to one specific small business. You are careful and conservative.

For each item, return JSON only, in this shape:
{"results": [{"id": "...", "relevance": "affects" | "might" | "not_applicable", "reason": "...", "actionNeeded": "..." or null, "summary": "..."}]}

Rules:
- "affects" only when the item clearly applies given the business's industry, location, employee counts, and flags.
- "not_applicable" only when it clearly cannot apply (e.g., a fisheries rule for a salon, a Montgomery County rule for a Baltimore City business).
- Everything uncertain is "might". When in doubt, choose "might".
- Location matters: Baltimore City and Baltimore County are separate jurisdictions. A county-only rule does not apply outside that county.
- Employee counts matter: use the right count (totalAllStates, inMaryland, or fullTimeInMaryland) when an item has a size threshold.
- "reason" is one sentence naming the specific business detail you used (e.g., "Applies because you run a restaurant in Baltimore City.").
- "summary" is your own plain-English summary in at most 2 sentences. Never copy regulation text.
- "actionNeeded" is a short instruction with a date if there is a deadline (e.g., "Submit comments by Oct 19, 2026."), otherwise null.
- Never invent dates, numbers, or requirements that are not in the item.
- News items that are only headlines (jobs reports, appointments, awards) do not create obligations; mark them "not_applicable" unless the headline itself describes a rule, deadline, or program for businesses like this one.
- Return exactly one result for every item id you are given.`;

const ResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      relevance: z.enum(["affects", "might", "not_applicable"]),
      reason: z.string(),
      actionNeeded: z.string().nullable(),
      summary: z.string(),
    }),
  ),
});
type LlmResult = z.infer<typeof ResultSchema>["results"][number];

interface CachedClassification {
  relevance: RadarResult["relevance"];
  reason: string;
  actionNeeded: string | null;
  summary: string;
  classifiedAt: string;
}

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

// Only the fields that can change a relevance decision.
export function profileKey(p: BusinessProfile): string {
  return hash({
    jurisdiction: p.jurisdiction,
    industry: p.industry,
    naicsCode: p.naicsCode ?? null,
    entityType: p.entityType,
    employees: p.employees,
    flags: p.flags,
  });
}

// Re-classify when the item's substance changes (e.g. a new deadline).
function itemKey(i: RadarItemInternal): string {
  return hash([i.title, i.citation, i.effectiveDate, i.commentDeadline, i.hearingDate, i.context]);
}

function toPublic(item: RadarItemInternal): RadarItem {
  const { context: _context, ...rest } = item;
  return rest;
}

function profileForPrompt(p: BusinessProfile) {
  return {
    businessName: p.businessName,
    jurisdiction: p.jurisdiction,
    entityType: p.entityType,
    industry: p.industry,
    naicsCode: p.naicsCode ?? null,
    employees: p.employees,
    flags: p.flags,
  };
}

function itemForPrompt(i: RadarItemInternal) {
  return {
    id: i.id,
    kind: i.kind,
    title: i.title,
    agency: i.agency,
    citation: i.citation,
    effectiveDate: i.effectiveDate,
    commentDeadline: i.commentDeadline,
    hearingDate: i.hearingDate,
    details: i.context ?? i.summary,
  };
}

// ---------- Gemini call with rate limiting ----------

class QuotaError extends Error {}
class AuthError extends Error {}

let nextSlot = 0;
let pausedUntil = 0; // set when the daily quota runs out
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Space requests evenly so we stay under GEMINI_RPM.
async function waitForSlot() {
  const gap = Math.ceil(60000 / GEMINI_RPM);
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + gap;
  if (slot > now) await sleep(slot - now);
}

function userMessage(profile: BusinessProfile, batch: RadarItemInternal[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `Today is ${today}.\n\nBusiness profile:\n${JSON.stringify(profileForPrompt(profile), null, 2)}\n\n` +
    `Regulatory items:\n${JSON.stringify(batch.map(itemForPrompt), null, 2)}`
  );
}

// Vertex AI returns 429 when we're over quota; back off and retry a few times.
async function callGemini(profile: BusinessProfile, batch: RadarItemInternal[]): Promise<LlmResult[]> {
  for (let attempt = 0; ; attempt++) {
    if (Date.now() < pausedUntil) throw new QuotaError("Gemini sorting is paused after an earlier failure");
    await waitForSlot();
    let text: string;
    try {
      // LOW thinking: ~3x faster than the default and matched it on 22 of 25 test items.
      text = await generateText(userMessage(profile, batch), {
        system: SYSTEM_PROMPT,
        jsonSchema: z.toJSONSchema(ResultSchema),
        thinkingLevel: ThinkingLevel.LOW,
      });
    } catch (err) {
      if (err instanceof GeminiApiError) {
        if (err.status === 401 || err.status === 403) {
          pausedUntil = Date.now() + 10 * 60 * 1000;
          throw new AuthError(`Vertex AI refused the request (HTTP ${err.status}); check credentials and that the API is enabled`);
        }
        if (err.status === 429 || err.status >= 500) {
          if (attempt >= MAX_RETRIES) throw new QuotaError(`Vertex AI is rate limiting us (HTTP ${err.status})`);
          const delay = 15 * (attempt + 1);
          console.warn(`[radar] Vertex AI HTTP ${err.status}; retrying in ${delay}s`);
          nextSlot = Math.max(nextSlot, Date.now() + delay * 1000);
          continue;
        }
        throw new Error(`Vertex AI returned HTTP ${err.status}`);
      }
      // Missing or invalid Application Default Credentials surface as plain errors.
      if (err instanceof Error && /credential|authenticat/i.test(err.message)) {
        pausedUntil = Date.now() + 10 * 60 * 1000;
        throw new AuthError("No Google Cloud credentials found (run gcloud auth application-default login)");
      }
      throw err;
    }
    const parsed = ResultSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error("Gemini response did not match the expected shape");
    return parsed.data.results;
  }
}

// One retry for bad output; quota and auth errors are not worth retrying here.
async function classifyBatch(profile: BusinessProfile, batch: RadarItemInternal[]): Promise<Map<string, LlmResult>> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const results = await callGemini(profile, batch);
      const ids = new Set(batch.map((i) => i.id));
      return new Map(results.filter((r) => ids.has(r.id)).map((r) => [r.id, r]));
    } catch (err) {
      console.warn(`[radar] sorting batch failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof QuotaError || err instanceof AuthError) throw err;
    }
  }
  return new Map();
}

// ---------- Background sorting per profile ----------

const running = new Map<string, Promise<void>>(); // profile key -> sorting job

// Read-modify-write of the cache file, one at a time so parallel batches
// (and parallel profiles) never overwrite each other's results.
let saveChain: Promise<void> = Promise.resolve();
function saveClassifications(entries: Record<string, CachedClassification>): Promise<void> {
  const run = saveChain.then(async () => {
    const cache = await readJson<Record<string, CachedClassification>>(CACHE_FILE, {});
    await writeJson(CACHE_FILE, Object.assign(cache, entries));
  });
  saveChain = run.catch(() => {});
  return run;
}

async function sortInBackground(todo: RadarItemInternal[], profile: BusinessProfile, key: (i: RadarItemInternal) => string) {
  const batches: RadarItemInternal[][] = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));
  let stopped = false;
  let next = 0;
  // A few batches in flight at once; waitForSlot() still caps requests per minute.
  const worker = async () => {
    while (!stopped && next < batches.length) {
      const batch = batches[next++];
      let results: Map<string, LlmResult>;
      try {
        results = await classifyBatch(profile, batch);
      } catch {
        stopped = true; // quota or credentials problem: stop; unsorted items stay "might"
        return;
      }
      if (results.size === 0) continue;
      // Save after every batch so the page can show progress.
      const now = new Date().toISOString();
      const entries: Record<string, CachedClassification> = {};
      for (const item of batch) {
        const r = results.get(item.id);
        if (r) entries[key(item)] = { relevance: r.relevance, reason: r.reason, actionNeeded: r.actionNeeded, summary: r.summary, classifiedAt: now };
      }
      await saveClassifications(entries);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker));
}

export interface ClassifyOutcome {
  results: RadarResult[];
  sortingInProgress: boolean;
}

// waitMs: how long to wait for background sorting before answering with what we have.
export async function classifyItems(items: RadarItemInternal[], profile: BusinessProfile, waitMs = Infinity): Promise<ClassifyOutcome> {
  const pKey = profileKey(profile);
  const key = (i: RadarItemInternal) => `${i.id}|${itemKey(i)}|${pKey}`;
  let cache = await readJson<Record<string, CachedClassification>>(CACHE_FILE, {});
  const todo = items.filter((i) => !cache[key(i)]);

  if (todo.length > 0 && Date.now() >= pausedUntil) {
    let job = running.get(pKey);
    if (!job) {
      job = sortInBackground(todo, profile, key).finally(() => running.delete(pKey));
      running.set(pKey, job);
    }
    if (waitMs === Infinity) await job;
    else await Promise.race([job, sleep(waitMs)]);
    cache = await readJson<Record<string, CachedClassification>>(CACHE_FILE, {});
  }

  const inProgress = running.has(pKey);
  const results = items.map((item): RadarResult => {
    const c = cache[key(item)];
    if (!c) {
      return { item: toPublic(item), relevance: "might", reason: inProgress ? PENDING_REASON : FALLBACK_REASON, actionNeeded: null, autoSorted: false };
    }
    return {
      item: { ...toPublic(item), summary: c.summary || item.summary },
      relevance: c.relevance,
      reason: c.reason,
      actionNeeded: c.actionNeeded,
      autoSorted: true,
    };
  });
  return { results, sortingInProgress: inProgress };
}
