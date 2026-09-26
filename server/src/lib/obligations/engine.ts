import type {
  BusinessProfile,
  Condition,
  ObligationResult,
  ObligationRule,
} from "../../../../shared/types.js";
import type { LocalTaxRates } from "./rules.js";

// Evaluates data-driven obligation rules against a business profile.
// Nothing here knows about any particular business or law.

type Outcome = "pass" | "fail" | "unknown";

interface Checked {
  outcome: Outcome;
  reason: string;
}

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
      reason: ok ? `Your business is in ${where}.` : `This is a ${where} rule, and your business is in ${jurisdictionName(profile)}.`,
    };
  }

  const actual = getField(profile, c.field);

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

export function matchesJurisdiction(rule: ObligationRule, profile: BusinessProfile): boolean {
  const { level, name } = rule.jurisdiction;
  if (level === "federal" || level === "state") return true;
  if (level === "county") return !name || name === profile.jurisdiction.county;
  // Municipality rules without a name would apply to every town; require one.
  return !!name && name === profile.jurisdiction.municipality;
}

function combine(checks: Checked[]): Outcome {
  if (checks.some((c) => c.outcome === "fail")) return "fail";
  if (checks.some((c) => c.outcome === "unknown")) return "unknown";
  return "pass";
}

function formatRate(n: number | undefined): string {
  return n === undefined ? "not available (no data)" : `${n.toFixed(1)}%`;
}

function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => vars[key] ?? m);
}

export function evaluateRule(rule: ObligationRule, profile: BusinessProfile, taxRates: LocalTaxRates): ObligationResult {
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

  // Fill local data into the text.
  const county = profile.jurisdiction.county;
  const rate = taxRates.rates[county];
  const vars: Record<string, string> = {
    county,
    municipality: profile.jurisdiction.municipality ?? "",
    admissionsRate: formatRate(rate?.admissions),
    hotelRate: formatRate(rate?.hotel),
  };
  const filled: ObligationRule = {
    ...rule,
    summary: fillTemplate(rule.summary, vars),
    action: fillTemplate(rule.action, vars),
  };

  // Coverage: we reviewed every rule in the library against its source. Local
  // rates can still be missing, and towns can add their own rates on top.
  let coverage: ObligationResult["coverage"] = "reviewed";
  let coverageNote: string | undefined;
  const usesLocalRate = /\{\{(admissionsRate|hotelRate)\}\}/.test(rule.summary);
  if (usesLocalRate && !rate) {
    coverage = "limited";
    coverageNote = `No data available for ${county}'s rate. Check with the county.`;
  } else if (usesLocalRate && profile.jurisdiction.municipality) {
    coverage = "limited";
    coverageNote = `Your town may charge its own rate. Check with ${profile.jurisdiction.municipality}.`;
  } else if (rule.jurisdiction.level === "municipality") {
    coverage = "limited";
  }

  return { rule: filled, status, reasons, coverage, ...(coverageNote ? { coverageNote } : {}) };
}

// Soonest deadline on or after `today` (YYYY-MM-DD), or undefined.
export function nextDeadline(rule: ObligationRule, today: string): string | undefined {
  return (rule.deadlines ?? [])
    .map((d) => d.date)
    .filter((d) => d >= today)
    .sort()[0];
}

const STATUS_ORDER = { affects: 0, might: 1, not_applicable: 2 } as const;

export function evaluate(
  profile: BusinessProfile,
  rules: ObligationRule[],
  taxRates: LocalTaxRates,
  today = new Date().toISOString().slice(0, 10),
): ObligationResult[] {
  const results = rules.map((r) => evaluateRule(r, profile, taxRates));
  return results.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const da = nextDeadline(a.rule, today) ?? "9999-12-31";
    const db = nextDeadline(b.rule, today) ?? "9999-12-31";
    return da.localeCompare(db) || a.rule.title.localeCompare(b.rule.title);
  });
}

// Plain-language notes about what we haven't reviewed for this location.
export function coverageNotes(profile: BusinessProfile): string[] {
  const notes: string[] = [];
  const { county, municipality } = profile.jurisdiction;
  if (!DEEP_COVERAGE.has(county)) {
    notes.push(
      `Coverage limited: we've reviewed statewide rules and the ${county} items shown here, but not every ${county} law. Check with the county for other local requirements.`,
    );
  }
  if (municipality) {
    notes.push(`We haven't reviewed ${municipality}'s local code yet. Check with the town directly.`);
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
