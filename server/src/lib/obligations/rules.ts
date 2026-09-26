import { promises as fs } from "node:fs";
import { z } from "zod";
import type { ObligationRule } from "../../../../shared/types.js";
import { dataPath, readJson } from "../jsonStore.js";

// Rules are data: every server/data/rules/*.json file holds an array of
// ObligationRule records. Invalid rules are skipped
// with a warning so one typo can't take down the whole page.

const RULES_DIR = dataPath("rules");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const condition = z.union([
  z.object({ field: z.literal("jurisdiction"), op: z.literal("match") }),
  z.object({
    field: z.string(),
    op: z.enum(["gte", "lte", "eq", "between"]),
    value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
  }),
  z.object({ field: z.string(), op: z.literal("is"), value: z.union([z.boolean(), z.string()]) }),
  z.object({ field: z.string(), op: z.enum(["in", "not_in"]), value: z.array(z.string()) }),
]);

const ruleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(["employment", "tax", "registration", "licensing", "posting", "privacy"]),
  jurisdiction: z.object({
    level: z.enum(["federal", "state", "county", "municipality"]),
    name: z.string().optional(),
  }),
  conditions: z.array(condition),
  mightConditions: z.array(condition).optional(),
  statusWhenMet: z.enum(["affects", "might", "not_applicable"]).optional(),
  summary: z.string().min(1),
  action: z.string().min(1),
  deadlines: z.array(z.object({ label: z.string(), date: isoDate })).optional(),
  agency: z.string().min(1).optional(),
  frequency: z.enum(["once", "ongoing", "every_payroll", "monthly", "quarterly", "yearly", "every_2_years", "varies"]).optional(),
  frequencyNote: z.string().optional(),
  recurring: z
    .object({
      every: z.enum(["month", "quarter", "year"]),
      day: z.union([z.number().int().min(1).max(31), z.literal("last")]),
      month: z.number().int().min(1).max(12).optional(),
      label: z.string().min(1),
      startsOn: isoDate.optional(),
    })
    .refine((r) => r.every !== "year" || r.month !== undefined, { message: "yearly schedules need a month" })
    .optional(),
  filingUrl: z.url().optional(),
  filingSiteName: z.string().optional(),
  verify: z.array(z.string().min(1)).optional(),
  sourceUrl: z.url(),
  sourceName: z.string().min(1),
  reviewedOn: isoDate,
});

export async function loadRules(): Promise<ObligationRule[]> {
  const files = (await fs.readdir(RULES_DIR)).filter((f) => f.endsWith(".json"));
  const rules: ObligationRule[] = [];
  const seen = new Set<string>();
  for (const file of files.sort()) {
    const raw = await readJson<unknown[]>(dataPath("rules", file), []);
    for (const item of raw) {
      const parsed = ruleSchema.safeParse(item);
      if (!parsed.success) {
        console.warn(`Skipping invalid rule in ${file}:`, parsed.error.issues[0]?.message, (item as { id?: string })?.id);
        continue;
      }
      if (seen.has(parsed.data.id)) {
        console.warn(`Skipping duplicate rule id ${parsed.data.id} in ${file}`);
        continue;
      }
      seen.add(parsed.data.id);
      rules.push(parsed.data as ObligationRule);
    }
  }
  return rules;
}
