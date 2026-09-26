import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BusinessProfile } from "../../../shared/types";
import { apiPost } from "../api";
import { useAuth } from "../auth";
import { BusinessFields, EmployeeFields, FlagFields, LocationFields } from "../components/ProfileFields";
import {
  FLAG_QUESTIONS,
  FMLA_OPTIONS,
  emptyDraft,
  employeeErrors,
  entityLabel,
  industryLabel,
  jurisdictionLabel,
  type ProfileDraft,
} from "../components/profileOptions";

const STEPS = ["Your business", "Location", "Employees", "Operations", "Review"];

export default function SetupPage() {
  const navigate = useNavigate();
  const { setHasProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function stepError(): string | null {
    if (step === 0) {
      if (!draft.businessName.trim()) return "Enter your business name.";
      if (!draft.industry) return "Choose what kind of business it is.";
    }
    if (step === 1) {
      if (!draft.jurisdiction.county) return "Look up your address first.";
      if (!locationConfirmed) return "Confirm that the location we found is right.";
    }
    if (step === 2) return employeeErrors(draft.employees);
    return null;
  }

  function next() {
    const err = stepError();
    setError(err);
    if (!err) setStep((s) => s + 1);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await apiPost<BusinessProfile>("/api/profile", draft);
      setHasProfile(true);
      navigate("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Set up your business</h1>
      <p className="mt-1 text-slate-600">A few questions so we can show what applies to you. Takes about 3 minutes.</p>

      <ol className="mt-6 flex gap-1" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={`h-2 rounded-full ${i <= step ? "bg-blue-700" : "bg-slate-200"}`} />
            <span className={`mt-1 hidden text-xs sm:block ${i === step ? "font-semibold text-blue-800" : "text-slate-500"}`}>{s}</span>
          </li>
        ))}
      </ol>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </h2>
        {step === 0 && <BusinessFields draft={draft} update={update} />}
        {step === 1 && (
          <LocationFields draft={draft} update={update} confirmed={locationConfirmed} setConfirmed={setLocationConfirmed} />
        )}
        {step === 2 && <EmployeeFields draft={draft} update={update} />}
        {step === 3 && <FlagFields draft={draft} update={update} />}
        {step === 4 && <Review draft={draft} goTo={setStep} />}

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep((s) => s - 1);
            }}
            disabled={step === 0}
            className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:invisible"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="rounded-md bg-blue-700 px-5 py-2 font-semibold text-white hover:bg-blue-800">
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-green-700 px-5 py-2 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save and see my results"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Review({ draft, goTo }: { draft: ProfileDraft; goTo: (step: number) => void }) {
  const rows: { step: number; label: string; value: string }[] = [
    { step: 0, label: "Business name", value: draft.businessName },
    { step: 0, label: "Entity type", value: entityLabel(draft.entityType) },
    { step: 0, label: "Industry", value: industryLabel(draft.industry) },
    { step: 1, label: "Address", value: draft.address },
    { step: 1, label: "Location", value: `${jurisdictionLabel(draft.jurisdiction)}, Maryland` },
    { step: 2, label: "Employees (all states)", value: String(draft.employees.totalAllStates) },
    { step: 2, label: "Employees in Maryland", value: String(draft.employees.inMaryland) },
    { step: 2, label: "Full-time in Maryland", value: String(draft.employees.fullTimeInMaryland) },
    {
      step: 2,
      label: "Covered by FMLA",
      value: FMLA_OPTIONS.find((o) => o.value === draft.employees.coveredByFMLA)?.label ?? "",
    },
    ...FLAG_QUESTIONS.map((q) => ({ step: 3, label: q.question, value: draft.flags[q.key] ? "Yes" : "No" })),
  ];
  return (
    <dl className="divide-y divide-slate-100">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-slate-600">{r.label}</dt>
          <dd className="flex items-center gap-3 text-right font-medium">
            {r.value}
            <button type="button" onClick={() => goTo(r.step)} className="text-sm font-normal text-blue-700 underline">
              Edit
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
