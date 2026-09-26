// Maryland Register (Division of State Documents), published every other Friday.
// Issue URL: https://dsd.maryland.gov/MDRIssues/{VVII}/Assembled.aspx (VV = volume, II = issue).
// The page is a Word export; we flatten it to text and pull out each
// "Notice of Proposed Action [26-153-P]" / "Notice of Final Action [26-046-F]".
// We keep only metadata plus a short excerpt for Claude; we never republish the text.

import * as cheerio from "cheerio";
import { HttpError, politeFetch } from "../http.js";
import { dataPath, readJson } from "../jsonStore.js";
import { cleanText, formatLongDate, parseLongDate, withCache, type RadarItemInternal, type SourceResult } from "./common.js";

const FIRST_KNOWN_ISSUE = 5319; // Volume 53, Issue 19 (Sept 18, 2026)
const CACHE_FILE = "md-register.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const issueUrl = (issue: number) => `https://dsd.maryland.gov/MDRIssues/${issue}/Assembled.aspx`;

interface RegisterCache {
  latestIssue: number;
  items: RadarItemInternal[];
}

async function fetchIssue(issue: number): Promise<string | null> {
  try {
    const res = await politeFetch(issueUrl(issue), {}, 30000);
    const html = await res.text();
    return /Issue Date:/i.test(html) ? html : null;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

function nextIssues(issue: number): number[] {
  const vol = Math.floor(issue / 100);
  return [issue + 1, (vol + 1) * 100 + 1];
}

function prevIssue(issue: number): number {
  const vol = Math.floor(issue / 100);
  const iss = issue % 100;
  return iss > 1 ? issue - 1 : (vol - 1) * 100 + 26;
}

// "DEPARTMENT OF NATURAL RESOURCES" -> "Department of Natural Resources"
function titleCase(s: string): string {
  const small = new Set(["of", "and", "the", "for", "on", "in", "to"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function findAgency(before: string): string | null {
  const re = /Title (\d{2}[A-Z]?) ([A-Z][A-Z ,.'’&—–-]{3,80}?)(?= Subtitle | \d{2}\.\d{2}\.\d{2} |[a-z])/g;
  let last: string | null = null;
  for (const m of before.matchAll(re)) last = m[2].trim();
  return last ? titleCase(last) : null;
}

// Pull "COMAR 10.15.03 Food Service Facilities" pairs from the notice's lead sentence.
function findChapters(lead: string): { citation: string; name: string | null }[] {
  const out: { citation: string; name: string | null }[] = [];
  const re = /COMAR (\d{2}[A-Z]?\.\d{2}\.\d{2})(?: ([^;.]{2,120}?))?\s*(?:;|\.(?:\s|$)|,? under|This action|and\s+(?:\(\d+\)|COMAR)|$)/g;
  for (const m of lead.matchAll(re)) {
    if (out.some((o) => o.citation === m[1])) continue;
    const name = m[2]?.replace(/[\s,:]+$/, "").trim() || null;
    out.push({ citation: m[1], name: name && /[a-z]/.test(name) ? name : null });
  }
  return out;
}

// "The Secretary of the Maryland Department of General Services proposes..." ->
// "Maryland Department of General Services". Falls back to the named official.
function findActor(body: string): string | null {
  const m = body.slice(0, 400).match(/\]\s*(?:On [A-Z][a-z]+ \d{1,2}, \d{4}, )?the (.{3,140}?) (?:proposes|adopted|has adopted)/i);
  if (!m) return null;
  const actor = m[1].trim();
  const body_ = actor.match(/((?:Maryland |State )?[A-Z][\w,’' -]*?(?:Department|Administration|Commission|Board|Office|Agency|Authority)\b[\w ,’'-]*)$/);
  const secretary = actor.match(/^(?:Acting )?Secretary of ([A-Z][\w ,’'-]+)$/);
  if (secretary) return `Maryland Department of ${secretary[1]}`;
  return (body_ ? body_[1] : actor).replace(/^(?:Acting )?(?:Executive Director|Secretary|Administrator|Director) of (?:the )?(?=.*(?:Department|Administration|Commission|Board|Office|Agency))/, "");
}

function between(text: string, start: RegExp, end: RegExp, max: number): string {
  const s = text.search(start);
  if (s < 0) return "";
  const rest = text.slice(s);
  const e = rest.slice(20).search(end);
  return rest.slice(0, e < 0 ? max : Math.min(max, e + 20));
}

export function parseIssue(html: string, issue: number, fetchedAt: string): RadarItemInternal[] {
  const $ = cheerio.load(html);
  $("script, style").remove();
  const text = cleanText($("body").text());
  const publishedDate = parseLongDate(text.match(/Issue Date:\s*([A-Za-z]+ \d{1,2}, \d{4})/)?.[1]);
  const notices = [...text.matchAll(/Notice of (Proposed|Final) Action\s*\[(\d{2}-\d{2,4}-[A-Z]+)\]/g)];
  const items: RadarItemInternal[] = [];

  notices.forEach((m, i) => {
    const start = m.index!;
    const end = i + 1 < notices.length ? notices[i + 1].index! : Math.min(text.length, start + 20000);
    const body = text.slice(start, end);
    const isFinal = m[1] === "Final";
    const docId = m[2];

    const lead = isFinal
      ? body.slice(0, Math.max(200, body.search(/This action, which was proposed|Effective Date:/)))
      : body.slice(0, Math.max(200, body.search(/Statement of Purpose/)));
    const chapters = findChapters(lead.slice(0, 2500));
    const agency = findActor(body) ?? findAgency(text.slice(Math.max(0, start - 60000), start));
    const citation = chapters.map((c) => c.citation).join(", ") || null;
    const names = chapters.map((c) => c.name).filter((n): n is string => !!n);
    const title = names.length ? names.slice(0, 3).join("; ") : citation ? `COMAR ${citation}` : `Regulation notice ${docId}`;

    let commentDeadline: string | null = null;
    let hearingDate: string | null = null;
    let effectiveDate: string | null = null;
    let context: string;

    if (isFinal) {
      effectiveDate = parseLongDate(body.match(/Effective Date:\s*([A-Za-z]+ \d{1,2}, \d{4})/)?.[1]);
      context = between(body, /Notice of Final Action/, /Effective Date:/, 700);
    } else {
      const comment = between(body, /Opportunity for Public Comment/, /\s\.\d{2}\s|Editor’s Note|\d{2}\.\d{2}\.\d{2}/, 1500);
      commentDeadline = parseLongDate(
        comment.match(
          /Comments? (?:will be accepted through|must be received (?:by|no later than)|may be (?:sent|submitted) (?:until|through))\s+([A-Za-z]+\.? \d{1,2},? \d{4})/i,
        )?.[1],
      );
      if (!/hearing has not been scheduled/i.test(comment)) {
        hearingDate = parseLongDate(comment.match(/hearing[^.]{0,200}?([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1]);
      }
      const purpose = between(body, /Statement of Purpose/, /Estimate of Economic Impact|Comparison to Federal/, 900);
      const smallBiz = between(body, /Economic Impact on Small Businesses/, /Impact on Individuals/, 300);
      context = `${lead.slice(0, 400)} ${purpose} ${smallBiz}`;
    }

    const what = isFinal ? "Final rule" : "Proposed rule change";
    const summaryParts = [`${what} from ${agency ?? "a state agency"} affecting ${title}${citation ? ` (COMAR ${citation})` : ""}.`];
    if (effectiveDate) summaryParts.push(`Takes effect ${formatLongDate(effectiveDate)}.`);
    else if (commentDeadline) summaryParts.push(`Public comments accepted through ${formatLongDate(commentDeadline)}.`);

    items.push({
      id: `mdr-${docId}`,
      source: "md_register",
      title,
      agency,
      kind: isFinal ? "final_regulation" : "proposed_regulation",
      citation: citation ? `COMAR ${citation}` : null,
      summary: summaryParts.join(" "),
      publishedDate,
      effectiveDate,
      commentDeadline,
      hearingDate,
      sourceUrl: issueUrl(issue),
      fetchedAt,
      context: cleanText(context).slice(0, 1500),
    });
  });

  if (notices.length === 0) {
    console.warn(`[radar] Maryland Register issue ${issue}: no notices found; page structure may have changed.`);
  }
  return items;
}

async function fetchLive(): Promise<RegisterCache> {
  // Walk forward from the newest issue we know about until an issue 404s.
  const prev = await readJson<{ data?: RegisterCache } | null>(dataPath("cache", CACHE_FILE), null);
  let latest = Math.max(FIRST_KNOWN_ISSUE, prev?.data?.latestIssue ?? 0);
  let latestHtml = await fetchIssue(latest);
  if (!latestHtml) throw new Error(`Maryland Register issue ${latest} did not load`);

  for (let guard = 0; guard < 6; guard++) {
    let advanced = false;
    for (const candidate of nextIssues(latest)) {
      const html = await fetchIssue(candidate);
      if (html) {
        latest = candidate;
        latestHtml = html;
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }

  const fetchedAt = new Date().toISOString();
  const byId = new Map<string, RadarItemInternal>();
  const issues = [latest, prevIssue(latest), prevIssue(prevIssue(latest))];
  for (const issue of issues) {
    const html = issue === latest ? latestHtml : await fetchIssue(issue);
    if (!html) continue;
    for (const item of parseIssue(html, issue, fetchedAt)) {
      if (!byId.has(item.id)) byId.set(item.id, item); // newest issue wins
    }
  }
  if (byId.size === 0) throw new Error("Maryland Register pages loaded but no notices could be read");
  return { latestIssue: latest, items: [...byId.values()] };
}

export async function fetchMdRegister(force = false): Promise<SourceResult> {
  const r = await withCache(CACHE_FILE, MAX_AGE_MS, force, fetchLive);
  return { source: "Maryland Register", items: r.data.items, fetchedAt: r.fetchedAt, fromFallback: r.fromFallback, error: r.error };
}
