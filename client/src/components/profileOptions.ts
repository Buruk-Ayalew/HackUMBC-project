import type { BusinessProfile, EntityType } from "../../../shared/types";

export const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "sole_prop", label: "Sole proprietorship" },
  { value: "general_partnership", label: "General partnership" },
  { value: "llc", label: "LLC" },
  { value: "corporation", label: "Corporation" },
  { value: "lp", label: "Limited partnership" },
  { value: "llp", label: "LLP" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "other", label: "Other" },
];

// Plain-language industries mapped to an internal value and NAICS code.
// Users never type a NAICS code.
export const INDUSTRY_OPTIONS: { value: string; label: string; naics?: string }[] = [
  { value: "restaurant", label: "Restaurant / bar", naics: "722511" },
  { value: "food_truck", label: "Food truck", naics: "722330" },
  { value: "retail", label: "Retail store", naics: "44" },
  { value: "salon", label: "Salon / personal care", naics: "812112" },
  { value: "professional_services", label: "Professional services / office", naics: "541" },
  { value: "contractor", label: "Contractor / construction", naics: "236" },
  { value: "hotel", label: "Hotel / lodging", naics: "721110" },
  { value: "childcare", label: "Childcare", naics: "624410" },
  { value: "healthcare", label: "Healthcare", naics: "62" },
  { value: "manufacturing", label: "Manufacturing", naics: "31" },
  { value: "other", label: "Other" },
];

export const MD_COUNTIES = [
  "Allegany County",
  "Anne Arundel County",
  "Baltimore City",
  "Baltimore County",
  "Calvert County",
  "Caroline County",
  "Carroll County",
  "Cecil County",
  "Charles County",
  "Dorchester County",
  "Frederick County",
  "Garrett County",
  "Harford County",
  "Howard County",
  "Kent County",
  "Montgomery County",
  "Prince George's County",
  "Queen Anne's County",
  "St. Mary's County",
  "Somerset County",
  "Talbot County",
  "Washington County",
  "Wicomico County",
  "Worcester County",
];

export type FlagKey = keyof BusinessProfile["flags"];

export const FLAG_QUESTIONS: { key: FlagKey; question: string; why: string }[] = [
  { key: "tippedEmployees", question: "Do any employees receive tips?", why: "Tipped staff have their own minimum wage and pay statement rules." },
  { key: "sellsTaxableGoods", question: "Do you sell goods or services that are subject to sales tax?", why: "You must register with the Comptroller before selling." },
  { key: "chargesAdmission", question: "Do you charge admission or fees for entertainment or recreation?", why: "Counties and towns tax admissions and amusements." },
  { key: "rentsLodging", question: "Do you rent rooms or other lodging to guests?", why: "Counties charge a hotel rental tax." },
  { key: "servesAlcohol", question: "Do you serve or sell alcohol?", why: "Alcohol licenses are issued and renewed by local liquor boards." },
  { key: "sellsToGovernment", question: "Do you sell to government agencies?", why: "Government contracts can come with extra requirements." },
  { key: "handlesCustomerData", question: "Do you keep customers' personal information (names, emails, purchase history)?", why: "Maryland's data privacy law may apply above certain customer counts." },
  { key: "servesFood", question: "Do you prepare, serve, or sell food?", why: "Food businesses need a license from the local health department, renewed every year." },
  { key: "ownsBusinessProperty", question: "Did your business own furniture, equipment, or other business property on January 1?", why: "Your county sends a personal property tax bill for it each year." },
  { key: "usesTradeName", question: "Do you operate under a name other than your legal business name?", why: "Trade names are registered with the state and must be renewed every 5 years." },
  {
    key: "meetsPrivacyThreshold",
    question: "Last year, did you handle personal data of 35,000+ Maryland consumers (or 10,000+ if over 20% of your revenue came from selling personal data)?",
    why: "Maryland's Online Data Privacy Act applies above these numbers. Data used only to complete a payment doesn't count.",
  },
];

export const FMLA_OPTIONS: { value: BusinessProfile["employees"]["coveredByFMLA"]; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

export function entityLabel(v: EntityType): string {
  return ENTITY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function industryLabel(v: string): string {
  return INDUSTRY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function jurisdictionLabel(j: BusinessProfile["jurisdiction"]): string {
  const base = j.isBaltimoreCity ? "Baltimore City" : j.county;
  return j.municipality ? `${j.municipality}, ${base}` : base;
}

// Draft profile used by the setup and settings forms.
export type ProfileDraft = Omit<BusinessProfile, "id" | "userId" | "updatedAt">;

export function emptyDraft(): ProfileDraft {
  return {
    businessName: "",
    address: "",
    lat: 0,
    lng: 0,
    jurisdiction: { state: "MD", county: "", isBaltimoreCity: false, municipality: null },
    entityType: "llc",
    industry: "",
    employees: { totalAllStates: 0, inMaryland: 0, fullTimeInMaryland: 0, coveredByFMLA: "unsure" },
    flags: {
      tippedEmployees: false,
      sellsTaxableGoods: false,
      chargesAdmission: false,
      rentsLodging: false,
      servesAlcohol: false,
      sellsToGovernment: false,
      handlesCustomerData: false,
    },
  };
}

export function toDraft(p: BusinessProfile): ProfileDraft {
  const { id: _id, userId: _u, updatedAt: _t, ...rest } = p;
  return rest;
}

export function employeeErrors(e: BusinessProfile["employees"]): string | null {
  const nums = [e.totalAllStates, e.inMaryland, e.fullTimeInMaryland];
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return "Employee counts must be whole numbers, 0 or more.";
  if (e.inMaryland > e.totalAllStates) return "Employees in Maryland can't be more than your total employees.";
  if (e.fullTimeInMaryland > e.inMaryland) return "Full-time employees can't be more than your Maryland employees.";
  return null;
}
