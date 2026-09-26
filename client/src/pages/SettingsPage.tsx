import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { BusinessProfile } from "../../../shared/types";
import { apiGet, apiPost, apiPut } from "../api";
import { useAuth } from "../auth";
import { BusinessFields, EmployeeFields, Field, FlagFields, LocationFields, inputClass } from "../components/ProfileFields";
import { employeeErrors, toDraft, type ProfileDraft } from "../components/profileOptions";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [savedAddress, setSavedAddress] = useState("");
  const [locationConfirmed, setLocationConfirmed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function load(p: BusinessProfile) {
    setDraft(toDraft(p));
    setSavedAddress(p.address);
    setLocationConfirmed(true);
  }

  useEffect(() => {
    apiGet<BusinessProfile>("/api/profile")
      .then(load)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (!draft) return <p className="text-slate-500">{error ?? "Loading…"}</p>;

  const update = (patch: Partial<ProfileDraft>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  async function save() {
    if (!draft) return;
    const err =
      !draft.businessName.trim()
        ? "Enter your business name."
        : draft.address !== savedAddress && !locationConfirmed
          ? "You changed the address. Look it up and confirm the location before saving."
          : !locationConfirmed
            ? "Confirm the location before saving."
            : employeeErrors(draft.employees);
    setError(err);
    if (err) return;
    setSaving(true);
    try {
      load(await apiPut<BusinessProfile>("/api/profile", draft));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Your business">
        <BusinessFields draft={draft} update={update} />
      </Section>
      <Section title="Location">
        <LocationFields draft={draft} update={update} confirmed={locationConfirmed} setConfirmed={setLocationConfirmed} />
      </Section>
      <Section title="Employees">
        <EmployeeFields draft={draft} update={update} />
      </Section>
      <Section title="About your operations">
        <FlagFields draft={draft} update={update} />
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
        {error && (
          <p role="alert" className="mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {saved && (
          <p className="mb-2 rounded-xl bg-green-50 p-3 text-sm text-green-900">
            Your results have been updated.{" "}
            <Link to="/obligations" className="font-semibold underline">
              See your obligations
            </Link>
          </p>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <PasswordSection />

      <SampleSwitcher onLoaded={(p) => { load(p); setSaved(true); }} />

      <Section title="Log out">
        <button
          onClick={async () => {
            await logout();
            navigate("/");
          }}
          className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Log out
        </button>
      </Section>
    </div>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiPost("/api/auth/password", { currentPassword: current, newPassword: next });
      setMsg({ ok: true, text: "Password changed." });
      setCurrent("");
      setNext("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <Section title="Change password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password">
          <input type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" why="At least 8 characters.">
          <input type="password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        {msg && <p className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
        <button className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">Change password</button>
      </form>
    </Section>
  );
}

// TEMPORARY testing tool: load a sample profile into this account.
// Remove before the demo (also remove /api/profile/samples and /load-sample).
function SampleSwitcher({ onLoaded }: { onLoaded: (p: BusinessProfile) => void }) {
  const [samples, setSamples] = useState<{ id: string; businessName: string; county: string }[]>([]);
  useEffect(() => {
    apiGet<typeof samples>("/api/profile/samples").then(setSamples).catch(() => setSamples([]));
  }, []);
  if (!samples.length) return null;
  return (
    <section className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-6">
      <h2 className="text-lg font-semibold text-amber-900">Testing: load a sample profile</h2>
      <p className="text-sm text-amber-800">Temporary tool for the team. Replaces this account's business details.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {samples.map((s) => (
          <button
            key={s.id}
            onClick={async () => onLoaded(await apiPost<BusinessProfile>("/api/profile/load-sample", { sampleId: s.id }))}
            className="rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-sm hover:bg-amber-100"
          >
            {s.businessName} ({s.county})
          </button>
        ))}
      </div>
    </section>
  );
}
