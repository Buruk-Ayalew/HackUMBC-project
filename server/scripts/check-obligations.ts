// Runs the obligations engine against every sample profile and checks the
// behaviour the project requires. Usage: npm run check:obligations -w server
import type { BusinessProfile, ObligationResult } from "../../shared/types.js";
import { getSampleProfiles } from "../src/lib/profile.js";
import { loadLocalTaxRates, loadRules } from "../src/lib/obligations/rules.js";
import { coverageNotes, employeeThresholds, evaluate, milestones } from "../src/lib/obligations/engine.js";
import { nextBusinessDay } from "../src/lib/obligations/schedule.js";

const rules = await loadRules();
const taxRates = await loadLocalTaxRates();
const samples = await getSampleProfiles();
let failures = 0;

function run(p: BusinessProfile) {
  const results = evaluate(p, rules, taxRates, "2026-09-26");
  return (id: string): ObligationResult => {
    const r = results.find((x) => x.rule.id === id);
    if (!r) throw new Error(`rule ${id} missing`);
    return r;
  };
}

function expect(label: string, r: ObligationResult, status: ObligationResult["status"]) {
  const ok = r.status === status;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${r.rule.id} = ${r.status}${ok ? "" : ` (expected ${status})`}`);
}

function withEmployees(p: BusinessProfile, e: Partial<BusinessProfile["employees"]>): BusinessProfile {
  return { ...p, employees: { ...p.employees, ...e } };
}

const [restaurant, salon, consultant, hotel, contractor] = samples as [
  BusinessProfile, BusinessProfile, BusinessProfile, BusinessProfile, BusinessProfile,
];

console.log("\n# 1. Baltimore City restaurant (14 employees)");
let get = run(restaurant);
for (const id of ["famli-register", "famli-contributions", "sick-leave-unpaid", "baltimore-city-ban-the-box", "state-tipped-wage", "state-minimum-wage", "alcohol-license",
  "md-unemployment-insurance", "md-withholding-returns", "sales-use-tax-returns", "restaurant-license", "food-service-license", "irs-941", "workers-comp"])
  expect("restaurant", get(id), "affects");
expect("restaurant", get("traders-license"), "might");
expect("restaurant", get("marylandsaves"), "might");

console.log("\n# Due dates (today = 2026-09-26)");
function expectDate(label: string, actual: string | undefined, want: string) {
  const ok = actual === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${want})`}`);
}
expectDate("UI Q3 2026 (Oct 31 is a Saturday)", get("md-unemployment-insurance").upcoming[0]?.date, "2026-11-02");
expectDate("Form 941 Q3 2026", get("irs-941").upcoming[0]?.date, "2026-11-02");
expectDate("MW506 for September", get("md-withholding-returns").upcoming[0]?.date, "2026-10-15");
expectDate("Sales tax Q3 2026", get("sales-use-tax-returns").upcoming[0]?.date, "2026-10-20");
expectDate("MW508 (Jan 31 2027 is a Sunday)", get("md-withholding-annual").upcoming[0]?.date, "2027-02-01");
expectDate("First FAMLI contribution", get("famli-contributions").upcoming[0]?.date, "2027-04-30");
expectDate("SDAT annual report", get("sdat-annual-report").upcoming[0]?.date, "2027-04-15");
expectDate("Restaurant license (May 1 2027 is a Saturday)", get("restaurant-license").upcoming[0]?.date, "2027-05-03");
expectDate("Veterans Day roll-forward", nextBusinessDay("2026-11-11"), "2026-11-12");
expectDate("Thanksgiving roll-forward", nextBusinessDay("2026-11-26"), "2026-11-27");
for (const id of ["famli-employer-share", "sick-leave-paid", "parental-leave", "state-ban-the-box", "montgomery-min-wage-small", "admissions-amusement-tax"])
  expect("restaurant", get(id), "not_applicable");

console.log("\n# 1b. Restaurant at 15 employees (15 full-time), FMLA unsure");
get = run(withEmployees(restaurant, { totalAllStates: 15, inMaryland: 15, fullTimeInMaryland: 15 }));
expect("restaurant@15", get("famli-employer-share"), "affects");
expect("restaurant@15", get("sick-leave-paid"), "affects");
expect("restaurant@15", get("sick-leave-unpaid"), "not_applicable");
expect("restaurant@15", get("parental-leave"), "might");
expect("restaurant@15", get("state-ban-the-box"), "affects");

console.log("\n# 2. Montgomery County salon (6 employees)");
get = run(salon);
expect("salon", get("montgomery-min-wage-small"), "affects");
expect("salon", get("montgomery-min-wage-mid"), "not_applicable");
expect("salon", get("state-minimum-wage"), "not_applicable");
expect("salon", get("montgomery-tipped-wage"), "affects");
expect("salon", get("state-tipped-wage"), "not_applicable");
expect("salon", get("baltimore-city-ban-the-box"), "not_applicable");
console.log("      notes:", coverageNotes(salon));

console.log("\n# 3. Frederick one-person LLC (0 employees)");
get = run(consultant);
expect("consultant", get("sdat-annual-report"), "affects");
for (const id of ["famli-register", "famli-contributions", "sick-leave-unpaid", "state-minimum-wage", "worker-freedom-act", "famli-private-plan", "parental-leave"])
  expect("consultant", get(id), "not_applicable");
const employerRules = evaluate(consultant, rules, taxRates).filter((r) => r.rule.category === "employment" && r.status !== "not_applicable");
if (employerRules.length) { failures++; console.log("FAIL  consultant has employment rules:", employerRules.map((r) => r.rule.id)); }

console.log("\n# 4. Ocean City hotel (40 employees)");
get = run(hotel);
const hotelTax = get("hotel-rental-tax");
expect("hotel", hotelTax, "affects");
console.log(`      summary: ${hotelTax.rule.summary}\n      coverage: ${hotelTax.coverage} / ${hotelTax.coverageNote}`);
expect("hotel", get("parental-leave"), "affects");
expect("hotel", get("online-data-privacy"), "might");
expect("hotel", get("famli-employer-share"), "affects");

console.log("\n# 5. Baltimore County contractor (60 employees, FMLA yes)");
get = run(contractor);
expect("contractor", get("baltimore-city-ban-the-box"), "not_applicable");
expect("contractor", get("parental-leave"), "not_applicable");
expect("contractor", get("sick-leave-paid"), "affects");
expect("contractor", get("state-ban-the-box"), "affects");
expect("contractor", get("federal-boi"), "not_applicable");
console.log("      notes:", coverageNotes(contractor));

console.log("\nthresholds:", employeeThresholds(rules).join(", "));

console.log("\n# Growth milestones for the restaurant (single-slider scale)");
const steps = milestones(restaurant, rules, taxRates);
for (const m of steps) console.log(`  at ${m.employees}: ${m.changes.map((c) => `${c.ruleId} ${c.from}->${c.to}`).join(", ")}`);
const at15 = steps.find((m) => m.employees === 15);
if (!at15?.changes.some((c) => c.ruleId === "famli-employer-share" && c.to === "affects")) {
  failures++;
  console.log("FAIL  milestone at 15 should turn on the FAMLI employer share");
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
