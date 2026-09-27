import type {
  BusinessProfile,
  Condition,
  Milestone,
  ObligationResult,
  ObligationRule,
  RuleVerification,
} from "../../../../shared/types.js";
import type { LiveValues } from "./live/index.js";
import { upcomingDates } from "./schedule.js";

// Evaluates data-driven obligation rules against a business profile.
// Nothing here knows about any particular business or law.

type Outcome = "pass" | "fail" | "unknown";

interface Checked {
  outcome: Outcome;
  reason: string;
}

// Live values read from official pages, plus each rule's latest source check.
export interface LiveContext {
  values: LiveValues;
  verification: Record<string, RuleVerification>;
}

export const EMPTY_LIVE: LiveContext = { values: {}, verification: {} };

// Counties where we've reviewed local rules in depth (launch area).
const DEEP_COVERAGE = new Set(["Baltimore City", "Baltimore County"]);

const NUMBER_LABELS: Record<string, [singular: string, plural: string]> = {
  "employees.inMaryland": ["employee in Maryland", "employees in Maryland"],
  "employees.totalAllStates": ["employee in total, counting all states", "employees in total, counting all states"],
  "employees.fullTimeInMaryland": ["full-time employee in Maryland", "full-time employees in Maryland"],
};

const FLAG_LABELS: Record<string, [yes: string, no: string]> = {
  "flags.tippedEmployees": ["Some of your employees receive tips.", "You told us no employees receive tips."],
  "flags.sellsTaxableGoods": ["You sell taxable goods or services.", "You told us you don't sell taxable goods or services."],
  "flags.chargesAdmission": ["You charge admission or amusement fees.", "You told us you don't charge admission or amusement fees."],
  "flags.rentsLodging": ["You rent rooms or lodging.", "You told us you don't rent rooms or lodging."],
  "flags.servesAlcohol": ["You serve or sell alcohol.", "You told us you don't serve or sell alcohol."],
  "flags.sellsToGovernment": ["You sell to government agencies.", "You told us you don't sell to government agencies."],
  "flags.handlesCustomerData": ["You keep customers' personal data.", "You told us you don't keep customers' personal data."],
  "flags.servesFood": ["You serve or sell food.", "You told us you don't serve or sell food."],
  "flags.ownsBusinessProperty": ["Your business owned property (furniture, equipment, and so on) on January 1.", "You told us your business didn't own business property on January 1."],
  "flags.usesTradeName": ["You operate under a trade name.", "You told us you don't use a trade name."],
  "flags.meetsPrivacyThreshold": ["You handle enough Maryland consumers' data to be covered.", "You told us you handle less Maryland consumer data than the law's thresholds."],
};

// Plain wording for questions that may not have been answered yet.
const FLAG_TOPICS: Record<string, string> = {
  "flags.servesFood": "whether you serve or sell food",
  "flags.ownsBusinessProperty": "whether your business owned property on January 1",
  "flags.usesTradeName": "whether you use a trade name",
  "flags.meetsPrivacyThreshold": "how much Maryland consumer data you handle",
};

const ENTITY_LABELS: Record<string, string> = {
  sole_prop: "a sole proprietorship",
  general_partnership: "a general partnership",
  llc: "an LLC",
  corporation: "a corporation",
  lp: "a limited partnership",
  llp: "an LLP",
  nonprofit: "a nonprofit",
  other: "another type of business",
};

function getField(profile: BusinessProfile, path: string): unknown {
  return path.split(".").reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], profile);
}

function countPhrase(n: number, field: string): string {
  const [one, many] = NUMBER_LABELS[field] ?? ["", ""];
  return `${n} ${n === 1 ? one : many}`.trim();
}

function thresholdPhrase(op: string, value: number | [number, number]): string {
  if (op === "between" && Array.isArray(value)) return `this applies at ${value[0]} to ${value[1]}`;
  if (op === "gte") return `this applies at ${value} or more`;
  if (op === "lte") return `this applies at ${value} or fewer`;
  return `this applies at exactly ${value}`;
}

function listPhrase(values: string[], field: string): string {
  const labels = values.map((v) => (field === "entityType" ? (ENTITY_LABELS[v] ?? v) : v));
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

function jurisdictionName(profile: BusinessProfile): string {
  return profile.jurisdiction.county;
}

function checkCondition(c: Condition, rule: ObligationRule, profile: BusinessProfile): Checked {
  if (c.op === "match") {
    const ok = matchesJurisdiction(rule, profile);
    const where = rule.jurisdiction.name ?? "your area";
    return {
      outcome: ok ? "pass" : "fail",
      reason: ok ? `Your business is in ${where}.` : `This is ${/^[AEIOU]/i.test(where) ? "an" : "a"} ${where} rule, and your business is in ${jurisdictionName(profile)}.`,
    };
  }

  const actual = getField(profile, c.field);

  // A question the owner hasn't answered yet also makes the result "might".
  if (actual === undefined && c.field.startsWith("flags.")) {
    return { outcome: "unknown", reason: `You haven't told us ${FLAG_TOPICS[c.field] ?? "this"} yet, so this might apply. Answer it in Settings.` };
  }

  // Any "unsure" answer that a rule depends on makes the result "might".
  if (actual === "unsure") {
    const label = c.field === "employees.coveredByFMLA" ? "whether the federal FMLA covers your business" : "this question";
    return { outcome: "unknown", reason: `You said you're not sure about ${label}, so this might apply.` };
  }

  switch (c.op) {
    case "gte":
    case "lte":
    case "eq":
    case "between": {
      const n = typeof actual === "number" ? actual : NaN;
      let ok = false;
      if (c.op === "gte") ok = n >= (c.value as number);
      else if (c.op === "lte") ok = n <= (c.value as number);
      else if (c.op === "eq") ok = n === c.value;
      else if (Array.isArray(c.value)) ok = n >= c.value[0] && n <= c.value[1];
      return {
        outcome: ok ? "pass" : "fail",
        reason: `You have ${countPhrase(n, c.field)} (${thresholdPhrase(c.op, c.value)}).`,
      };
    }
    case "is": {
      const ok = actual === c.value;
      if (c.field in FLAG_LABELS) {
        const [yes, no] = FLAG_LABELS[c.field]!;
        return { outcome: ok ? "pass" : "fail", reason: actual ? yes : no };
      }
      if (c.field === "employees.coveredByFMLA") {
        return {
          outcome: ok ? "pass" : "fail",
          reason:
            actual === "yes"
              ? "You said the federal FMLA covers your business."
              : "You said the federal FMLA does not cover your business.",
        };
      }
      return { outcome: ok ? "pass" : "fail", reason: `Your answer for ${c.field} is "${String(actual)}".` };
    }
    case "in":
    case "not_in": {
      const inList = c.value.includes(String(actual));
      const ok = c.op === "in" ? inList : !inList;
      if (c.field === "entityType") {
        const yours = ENTITY_LABELS[String(actual)] ?? String(actual);
        return {
          outcome: ok ? "pass" : "fail",
          reason:
            c.op === "in"
              ? `Your business is ${yours} (this applies to ${listPhrase(c.value, c.field)}).`
              : `Your business is ${yours}${ok ? "." : `, which is handled differently here.`}`,
        };
      }
      if (c.field === "jurisdiction.county") {
        return {
          outcome: ok ? "pass" : "fail",
          reason: ok
            ? `Your business is in ${String(actual)}${c.op === "not_in" ? ", which uses the state rate." : "."}`
            : `Your business is in ${String(actual)}, which has its own local rule.`,
        };
      }
      return { outcome: ok ? "pass" : "fail", reason: `Your answer for ${c.field} is "${String(actual)}".` };
    }
  }
}

// Town names come from Census or MD iMAP ("COLLEGE PARK"), so compare loosely.
function sameTown(a: string, b: string | null | undefined): boolean {
  return !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function matchesJurisdiction(rule: ObligationRule, profile: BusinessProfile): boolean {
  const { level, name } = rule.jurisdiction;
  if (level === "federal" || level === "state") return true;
  if (level === "county") return !name || name === profile.jurisdiction.county;
  // Municipality rules without a name would apply to every town; require one.
  return !!name && sameTown(name, profile.jurisdiction.municipality);
}

function combine(checks: Checked[]): Outcome {
  if (checks.some((c) => c.outcome === "fail")) return "fail";
  if (checks.some((c) => c.outcome === "unknown")) return "unknown";
  return "pass";
}

// Template variables from the profile and the live values. A value that
// couldn't be read live is simply absent: never a guess.
function templateVars(profile: BusinessProfile, values: LiveValues): Record<string, string> {
  const county = profile.jurisdiction.county;
  const vars: Record<string, string> = { county, municipality: profile.jurisdiction.municipality ?? "" };
  const rate = values.taxRates?.rates[county];
  if (values.taxRates) vars.taxYear = values.taxRates.fiscalYear;
  if (rate) {
    vars.admissionsRate = `${rate.admissions}%`;
    vars.hotelRate = `${rate.hotel}%`;
  }
  for (const [k, v] of Object.entries(values.wages ?? {})) if (typeof v === "string") vars[`wage.${k}`] = v;
  for (const [k, v] of Object.entries(values.famli ?? {})) if (typeof v === "string") vars[`famli.${k}`] = v;
  return vars;
}

// Which live source a template variable comes from.
function sourceOf(key: string): string | null {
  if (key.startsWith("wage.")) return "wages";
  if (key.startsWith("famli.")) return "famli";
  if (key === "admissionsRate" || key === "hotelRate" || key === "taxYear") return "taxRates";
  return null;
}

const VAR = /\{\{([\w.]+)\}\}/g;

// "[[ ... {{key}} ... ]]" is an optional part: dropped if any value in it is
// missing, so the sentence still reads well without the number.
function fillTemplate(text: string, vars: Record<string, string>): { text: string; missing: boolean } {
  let missing = false;
  const out = text
    .replace(/\[\[(.*?)\]\]/g, (_, part: string) => {
      const keys = [...part.matchAll(VAR)].map((m) => m[1]!);
      if (keys.some((k) => vars[k] === undefined)) {
        missing = true;
        return "";
      }
      return part.replace(VAR, (_m, k: string) => vars[k]!);
    })
    .replace(VAR, (_m, k: string) => {
      if (vars[k] !== undefined) return vars[k];
      missing = true;
      return "(not available)";
    });
  // A dropped opening part ("As of July 1, 2026, ") can leave a lowercase start.
  return { text: out.charAt(0).toUpperCase() + out.slice(1), missing };
}

export function evaluateRule(
  rule: ObligationRule,
  profile: BusinessProfile,
  live: LiveContext,
  today = new Date().toISOString().slice(0, 10),
): ObligationResult {
  const checks = rule.conditions.map((c) => checkCondition(c, rule, profile));
  const main = combine(checks);
  const reasons = checks.map((c) => c.reason);
  const whenMet = rule.statusWhenMet ?? "affects";

  let status: ObligationResult["status"];
  if (main === "pass") {
    status = whenMet;
    if (whenMet === "might") reasons.push("Whether this applies depends on details we don't ask about. Check the official source.");
  } else if (main === "unknown") {
    status = whenMet === "not_applicable" ? "not_applicable" : "might";
  } else {
    // A county rule for another county is simply not applicable.
    const wrongPlace = rule.jurisdiction.level !== "state" && rule.jurisdiction.level !== "federal" && !matchesJurisdiction(rule, profile);
    const might = !wrongPlace && rule.mightConditions ? combine(rule.mightConditions.map((c) => checkCondition(c, rule, profile))) : "fail";
    status = might === "fail" ? "not_applicable" : "might";
    if (status === "might") reasons.push("Businesses like yours may be covered. Check the official source to be sure.");
  }

  // Fill local data and live values into the text.
  const county = profile.jurisdiction.county;
  const vars = templateVars(profile, live.values);
  const title = fillTemplate(rule.title, vars);
  const summary = fillTemplate(rule.summary, vars);
  const action = fillTemplate(rule.action, vars);
  const filled: ObligationRule = { ...rule, title: title.text, summary: summary.text, action: action.text };
  const allText = rule.title + rule.summary + rule.action;
  const valueSources = [...new Set([...allText.matchAll(VAR)].map((m) => sourceOf(m[1]!)).filter((x): x is string => !!x))];

  // Coverage: we reviewed every rule in the library against its source. Live
  // values can still be missing, and towns can add their own rates on top.
  let coverage: ObligationResult["coverage"] = "reviewed";
  let coverageNote: string | undefined;
  const usesLocalRate = /\{\{(admissionsRate|hotelRate)\}\}/.test(rule.summary);
  if (usesLocalRate && live.values.taxRates && !live.values.taxRates.rates[county]) {
    coverage = "limited";
    coverageNote = `No data available for ${county}'s rate. Check with the county.`;
  } else if (title.missing || summary.missing || action.missing) {
    coverage = "limited";
    coverageNote = "We couldn't read the current amount from the official page. Check the official source for the exact figure.";
  } else if (usesLocalRate && profile.jurisdiction.municipality) {
    coverage = "limited";
    coverageNote = `Your town may charge its own rate. Check with ${profile.jurisdiction.municipality}.`;
  } else if (rule.jurisdiction.level === "municipality") {
    coverage = "limited";
  }
  const verification = live.verification[rule.id];

  return {
    rule: filled,
    status,
    reasons,
    coverage,
    ...(coverageNote ? { coverageNote } : {}),
    upcoming: upcomingDates(filled, today),
    ...(verification ? { verification } : {}),
    ...(valueSources.length ? { valueSources } : {}),
  };
}

const STATUS_ORDER = { affects: 0, might: 1, not_applicable: 2 } as const;

export function evaluate(
  profile: BusinessProfile,
  rules: ObligationRule[],
  live: LiveContext,
  today = new Date().toISOString().slice(0, 10),
): ObligationResult[] {
  const results = rules.map((r) => evaluateRule(r, profile, live, today));
  return results.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const da = a.upcoming[0]?.date ?? "9999-12-31";
    const db = b.upcoming[0]?.date ?? "9999-12-31";
    return da.localeCompare(db) || a.rule.title.localeCompare(b.rule.title);
  });
}

// Plain-language notes about what we haven't reviewed for this location.
// Kept short: shown as one small line at the top of the page.
export function coverageNotes(
  profile: BusinessProfile,
  rules: ObligationRule[] = [],
  reviewedTowns: { name: string; finding: string }[] = [],
): string[] {
  const notes: string[] = [];
  const { county, municipality } = profile.jurisdiction;
  if (!DEEP_COVERAGE.has(county)) {
    notes.push(`Coverage limited: statewide and ${county} rules reviewed, but not every ${county} law.`);
  }
  if (municipality) {
    // A town with rules in the library has had its licenses checked (not its whole code).
    const hasRules = rules.some((r) => r.jurisdiction.level === "municipality" && !!r.jurisdiction.name && sameTown(r.jurisdiction.name, municipality));
    const reviewed = reviewedTowns.find((t) => sameTown(t.name, municipality));
    notes.push(
      reviewed
        ? `${municipality}: town licenses checked (${reviewed.finding.replace(/\.$/, "")}); full town code not reviewed.`
        : hasRules
          ? `${municipality}: town licenses checked; full town code not reviewed.`
          : `${municipality}: town code not reviewed yet; check with the town.`,
    );
  }
  return notes;
}

// Employee counts where some rule's result can change, read from the rules'
// numeric employee conditions (never hard-coded).
export function employeeThresholds(rules: ObligationRule[]): number[] {
  const points = new Set<number>();
  for (const rule of rules) {
    for (const c of [...rule.conditions, ...(rule.mightConditions ?? [])]) {
      if (!("value" in c) || !c.field.startsWith("employees.")) continue;
      if (c.op === "gte" && typeof c.value === "number") points.add(c.value);
      else if (c.op === "lte" && typeof c.value === "number") points.add(c.value + 1);
      else if (c.op === "eq" && typeof c.value === "number") points.add(c.value).add(c.value + 1);
      else if (c.op === "between" && Array.isArray(c.value)) points.add(c.value[0]).add(c.value[1] + 1);
    }
  }
  return [...points].filter((n) => n > 0).sort((a, b) => a - b);
}

// Single-slider scaling used by the Growth Planner: Maryland headcount = n,
// full-time scaled by today's full-time ratio, total never below today's.
export function scaledCounts(profile: BusinessProfile, n: number) {
  const e = profile.employees;
  const ratio = e.inMaryland > 0 ? e.fullTimeInMaryland / e.inMaryland : 1;
  return {
    inMaryland: n,
    fullTimeInMaryland: Math.min(n, Math.round(n * ratio)),
    totalAllStates: Math.max(e.totalAllStates, n),
  };
}

// For each headcount where some rule could change, what actually changes
// compared with one employee fewer (on the single-slider scale).
export function milestones(
  profile: BusinessProfile,
  rules: ObligationRule[],
  live: LiveContext,
  max = 100,
): Milestone[] {
  const statusAt = (n: number) => {
    const p = { ...profile, employees: { ...profile.employees, ...scaledCounts(profile, n) } };
    return new Map(rules.map((r) => [r.id, evaluateRule(r, p, live)]));
  };
  // Full-time scaling can move thresholds, so check every headcount.
  const out: Milestone[] = [];
  let prev = statusAt(0);
  for (let n = 1; n <= max; n++) {
    const cur = statusAt(n);
    const changes: Milestone["changes"] = [];
    for (const [id, r] of cur) {
      const before = prev.get(id)!;
      if (before.status !== r.status) {
        changes.push({
          ruleId: id,
          title: r.rule.title,
          from: before.status,
          to: r.status,
          reason: r.reasons.find((x) => /employee/.test(x)) ?? r.reasons[0] ?? "",
        });
      }
    }
    if (changes.length) out.push({ employees: n, counts: scaledCounts(profile, n), changes });
    prev = cur;
  }
  return out;
}
