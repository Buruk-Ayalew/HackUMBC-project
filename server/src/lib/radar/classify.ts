// Relevance sorting with Claude: RadarItem[] + BusinessProfile -> RadarResult[].
// Results are cached per item + the profile fields that matter, so each
// business only pays for items it hasn't seen yet.

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { BusinessProfile, RadarItem, RadarResult } from "../../../../shared/types.js";
import { dataPath, readJson, writeJson } from "../jsonStore.js";
import type { RadarItemInternal } from "./common.js";

const MODEL = "claude-sonnet-5";
const BATCH_SIZE = 10;
const CONCURRENCY = 5;
const CACHE_FILE = dataPath("cache", "radar-classifications.json");
const FALLBACK_REASON = "Automatic sorting unavailable, review manually.";

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
type ClaudeResult = z.infer<typeof ResultSchema>["results"][number];

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

let client: Anthropic | null = null;
let warnedNoKey = false;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

async function callClaude(profile: BusinessProfile, batch: RadarItemInternal[]): Promise<ClaudeResult[]> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is not set");
  const today = new Date().toISOString().slice(0, 10);
  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: zodOutputFormat(ResultSchema) },
    messages: [
      {
        role: "user",
        content:
          `Today is ${today}.\n\nBusiness profile:\n${JSON.stringify(profileForPrompt(profile), null, 2)}\n\n` +
          `Regulatory items:\n${JSON.stringify(batch.map(itemForPrompt), null, 2)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to classify this batch");
  if (!response.parsed_output) throw new Error(`Unparseable Claude response (stop_reason: ${response.stop_reason})`);
  return response.parsed_output.results;
}

async function classifyBatch(profile: BusinessProfile, batch: RadarItemInternal[]): Promise<Map<string, ClaudeResult>> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const results = await callClaude(profile, batch);
      const ids = new Set(batch.map((i) => i.id));
      return new Map(results.filter((r) => ids.has(r.id)).map((r) => [r.id, r]));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[radar] classification attempt ${attempt} failed: ${msg}`);
      if (msg.includes("ANTHROPIC_API_KEY") || err instanceof Anthropic.AuthenticationError) break;
    }
  }
  return new Map();
}

async function runPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

export async function classifyItems(items: RadarItemInternal[], profile: BusinessProfile): Promise<RadarResult[]> {
  const pKey = profileKey(profile);
  const cache = await readJson<Record<string, CachedClassification>>(CACHE_FILE, {});
  const key = (i: RadarItemInternal) => `${i.id}|${itemKey(i)}|${pKey}`;

  const todo = items.filter((i) => !cache[key(i)]);
  if (todo.length > 0 && !getClient()) {
    if (!warnedNoKey) console.warn("[radar] ANTHROPIC_API_KEY is not set; unsorted items default to \"might\".");
    warnedNoKey = true;
  } else if (todo.length > 0) {
    const batches: RadarItemInternal[][] = [];
    for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));
    const maps = await runPool(batches.map((b) => () => classifyBatch(profile, b)), CONCURRENCY);
    // Re-read in case another request wrote classifications meanwhile.
    const latest = await readJson<Record<string, CachedClassification>>(CACHE_FILE, {});
    const now = new Date().toISOString();
    let added = 0;
    for (const m of maps) {
      for (const item of todo) {
        const r = m.get(item.id);
        if (!r) continue;
        latest[key(item)] = { relevance: r.relevance, reason: r.reason, actionNeeded: r.actionNeeded, summary: r.summary, classifiedAt: now };
        added++;
      }
    }
    if (added > 0) await writeJson(CACHE_FILE, latest);
    Object.assign(cache, latest);
  }

  return items.map((item): RadarResult => {
    const c = cache[key(item)];
    if (!c) {
      return { item: toPublic(item), relevance: "might", reason: FALLBACK_REASON, actionNeeded: null, autoSorted: false };
    }
    return {
      item: { ...toPublic(item), summary: c.summary || item.summary },
      relevance: c.relevance,
      reason: c.reason,
      actionNeeded: c.actionNeeded,
      autoSorted: true,
    };
  });
}
