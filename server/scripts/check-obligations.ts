// Runs the obligations engine against every sample profile and checks the
// behaviour the project requires. Statuses and dates are checked with no live
// data at all, so they never depend on the network.
// Usage: npm run check:obligations -w server [-- --live]
//   --live  also fetches the official pages and checks live values and rule checks
import type { BusinessProfile, ObligationResult } from "../../shared/types.js";
import { getSampleProfiles } from "../src/lib/profile.js";
import { loadRules } from "../src/lib/obligations/rules.js";
import { EMPTY_LIVE, coverageNotes, employeeThresholds, evaluate, milestones, type LiveContext } from "../src/lib/obligations/engine.js";
import { refreshLiveData } from "../src/lib/obligations/live/index.js";
import { nextBusinessDay } from "../src/lib/obligations/schedule.js";

const rules = await loadRules();
const samples = await getSampleProfiles();
let failures = 0;

function run(p: BusinessProfile, live: LiveContext = EMPTY_LIVE) {
  const results = evaluate(p, rules, live, "2026-09-26");
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
const employerRules = evaluate(consultant, rules, EMPTY_LIVE).filter((r) => r.rule.category === "employment" && r.status !== "not_applicable");
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

console.log("\n# Hiring, posting, and government-sales rules");
get = run(restaurant);
for (const id of ["federal-i9", "md-new-hire-reporting", "mosh-poster", "federal-ein"]) expect("restaurant", get(id), "affects");
for (const id of ["federal-posters", "mosh-injury-log"]) expect("restaurant", get(id), "might");
for (const id of ["eeo-1-report", "sam-registration", "emma-registration", "childcare-license"]) expect("restaurant", get(id), "not_applicable");
get = run(consultant);
expect("consultant (LLC, 0 staff)", get("federal-ein"), "might");
for (const id of ["federal-i9", "md-new-hire-reporting", "mosh-poster", "mosh-injury-log"]) expect("consultant", get(id), "not_applicable");
get = run(salon);
expect("salon (6 staff)", get("mosh-injury-log"), "not_applicable");
get = run(contractor);
for (const id of ["eeo-1-report", "sam-registration", "emma-registration"]) expect("contractor (60, sells to gov)", get(id), "might");
expect("contractor@100", run(withEmployees(contractor, { totalAllStates: 100 }))("eeo-1-report"), "affects");
expect("childcare", run({ ...consultant, industry: "childcare" })("childcare-license"), "affects");

console.log("\n# Local licenses and bills");
get = run(restaurant);
expect("restaurant (Baltimore City, alcohol)", get("liquor-renewal-baltimore-city"), "affects");
expectDate("Baltimore City liquor renewal (statutory window, not moved)", get("liquor-renewal-baltimore-city").upcoming[0]?.date, "2027-03-31");
for (const id of ["liquor-renewal-feb-mar", "liquor-renewal-default", "ocean-city-business-license"]) expect("restaurant", get(id), "not_applicable");
expect("restaurant (owns property)", get("local-personal-property-tax"), "affects");
expectDate("personal property bill", get("local-personal-property-tax").upcoming[0]?.date, "2026-09-30");
get = run(hotel);
expect("hotel (Ocean City)", get("ocean-city-business-license"), "affects");
expect("hotel (Ocean City, rents lodging)", get("ocean-city-rental-license"), "might");
expect("hotel (no alcohol)", get("liquor-renewal-default"), "not_applicable");
expect("hotel serving alcohol (Worcester)", run({ ...hotel, flags: { ...hotel.flags, servesAlcohol: true } })("liquor-renewal-default"), "affects");
const calvert = run({ ...restaurant, jurisdiction: { ...restaurant.jurisdiction, county: "Calvert County", isBaltimoreCity: false } })("liquor-renewal-calvert");
expectDate("Calvert liquor renewal May 1, 2027 (a Saturday, kept as written)", calvert.upcoming[0]?.date, "2027-05-01");
expect("salon (Rockville, not Ocean City)", run(salon)("ocean-city-business-license"), "not_applicable");

console.log("\n# New intake questions (food, property, trade name)");
expect("consultant (no property)", run(consultant)("local-personal-property-tax"), "not_applicable");
const unanswered = { ...hotel, flags: { ...hotel.flags, servesFood: undefined, ownsBusinessProperty: undefined, usesTradeName: undefined } };
expect("hotel, questions unanswered", run(unanswered)("local-personal-property-tax"), "might");
expect("hotel, questions unanswered", run(unanswered)("food-service-license-other"), "might");
expect("hotel, questions unanswered", run(unanswered)("trade-name-renewal"), "might");
expect("hotel with a restaurant", run({ ...hotel, flags: { ...hotel.flags, servesFood: true } })("food-service-license-other"), "affects");
expect("restaurant (industry already covered)", run(restaurant)("food-service-license-other"), "not_applicable");
expect("restaurant using a trade name", run({ ...restaurant, flags: { ...restaurant.flags, usesTradeName: true } })("trade-name-renewal"), "affects");
const calvertCafe = { ...salon, industry: "retail", jurisdiction: { ...salon.jurisdiction, county: "Calvert County", municipality: null }, flags: { ...salon.flags, servesFood: true } };
expectDate("Calvert food license (Oct 31)", run(calvertCafe)("food-license-renewal-calvert").upcoming[0]?.date, "2026-10-31");
expect("Frederick consultant (no food)", run(consultant)("food-license-renewal-frederick"), "not_applicable");

console.log("\n# Town rules");
const inTown = (p: BusinessProfile, county: string, municipality: string, extra: Partial<BusinessProfile> = {}): BusinessProfile => ({
  ...p,
  ...extra,
  jurisdiction: { state: "MD", county, isBaltimoreCity: false, municipality },
});
expect("salon in College Park (iMAP spelling)", run(inTown(salon, "Prince George's County", "COLLEGE PARK"))("college-park-occupancy-permit"), "affects");
expect("salon in Annapolis", run(inTown(salon, "Anne Arundel County", "Annapolis"))("annapolis-certificate-of-use"), "affects");
expect("restaurant in Laurel (alcohol)", run(inTown(restaurant, "Prince George's County", "Laurel"))("laurel-alcohol-license"), "affects");
expect("salon in Laurel (no alcohol)", run(inTown(salon, "Prince George's County", "Laurel"))("laurel-alcohol-license"), "not_applicable");
expect("food truck in Gaithersburg", run(inTown(salon, "Montgomery County", "Gaithersburg", { industry: "food_truck" }))("gaithersburg-mobile-food-vendor"), "affects");
expect("contractor in Hagerstown", run(inTown(contractor, "Washington County", "Hagerstown"))("hagerstown-contractor-license"), "affects");
expect("salon in Greenbelt", run(inTown(salon, "Prince George's County", "Greenbelt"))("greenbelt-commercial-license"), "might");
expect("salon in Rockville (not College Park)", run(salon)("college-park-occupancy-permit"), "not_applicable");
const bowieNotes = coverageNotes(inTown(salon, "Prince George's County", "Bowie"), rules, [{ name: "Bowie", finding: "No separate City business license." }]);
check(bowieNotes.some((n) => n.startsWith("Bowie: town licenses checked (No separate City business license)")), `Bowie note: ${bowieNotes.at(-1)}`);

console.log("\nthresholds:", employeeThresholds(rules).join(", "));

console.log("\n# Growth milestones for the restaurant (single-slider scale)");
const steps = milestones(restaurant, rules, EMPTY_LIVE);
for (const m of steps) console.log(`  at ${m.employees}: ${m.changes.map((c) => `${c.ruleId} ${c.from}->${c.to}`).join(", ")}`);
const at15 = steps.find((m) => m.employees === 15);
if (!at15?.changes.some((c) => c.ruleId === "famli-employer-share" && c.to === "affects")) {
  failures++;
  console.log("FAIL  milestone at 15 should turn on the FAMLI employer share");
}
function check(ok: boolean, label: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

// Leftover placeholders or a "not available" gap in the text.
const leftovers = (r: ObligationResult) =>
  [r.rule.title, r.rule.summary, r.rule.action].filter((t) => /\{\{|\}\}|\[\[|\]\]|\(not available\)/.test(t));

console.log("\n# Templates with no live values: no leftover placeholders");
for (const p of samples) {
  const bad = evaluate(p, rules, EMPTY_LIVE).flatMap(leftovers);
  check(bad.length === 0, `${p.businessName}: text reads cleanly${bad.length ? `: ${bad[0]}` : ""}`);
}
const noLiveWage = run(salon)("montgomery-min-wage-small");
check(noLiveWage.coverage === "limited" && !!noLiveWage.coverageNote, "a missing live wage is labeled coverage limited");

if (process.argv.includes("--live")) {
  console.log("\n# Live values and source checks (fetching official pages)");
  const live = await refreshLiveData(rules);
  for (const s of Object.values(live.sources)) console.log(`      ${s.status.padEnd(11)} ${s.name}${s.error ? ` (${s.error})` : ""}`);
  const at15 = withEmployees(restaurant, { totalAllStates: 15, inMaryland: 15, fullTimeInMaryland: 15 });
  const wage = run(salon, live)("montgomery-min-wage-small");
  const hotelTax = run(hotel, live)("hotel-rental-tax");
  console.log(`      salon: ${wage.rule.title}\n      hotel: ${hotelTax.rule.summary}`);
  console.log(`      restaurant@15: ${run(at15, live)("famli-employer-share").rule.action}`);
  if (live.values.wages) check(/\$\d/.test(wage.rule.title) && wage.coverage === "reviewed", "salon title shows the Montgomery small-employer wage");
  if (live.values.taxRates) check(/\d%/.test(hotelTax.rule.summary), "hotel summary shows the Worcester hotel tax rate");
  const v = Object.entries(live.verification);
  const by = (st: string) => v.filter(([, x]) => x.status === st);
  console.log(`      rule checks: ${by("verified").length} verified, ${by("changed").length} changed, ${by("saved").length} saved, ${by("unavailable").length} unavailable (of ${v.length})`);
  for (const [id, x] of by("changed")) console.log(`      CHANGED ${id}: missing ${JSON.stringify(x.missing)}`);
  for (const [id, x] of [...by("unavailable"), ...by("saved")]) console.log(`      ${x.status.toUpperCase()} ${id}: ${x.error}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
