import type { ObligationResult, ObligationsResponse, RuleVerification } from "../../../shared/types";
import { IconAlert, IconCheck, IconInfo } from "./icons";
import { Badge, buttonStyles } from "./ui";

// Labels for the live checks: each item is re-checked against its official
// page, and amounts (wages, tax rates, FAMLI rate) are read live.

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function when(iso: string): string {
  const d = new Date(iso);
  return isToday(iso)
    ? `today at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function VerificationBadge({ v }: { v?: RuleVerification }) {
  if (!v) return null;
  if (v.status === "verified")
    return (
      <Badge tone="green">
        <IconCheck /> {isToday(v.checkedAt) ? "Checked live today" : `Checked live ${when(v.checkedAt)}`}
      </Badge>
    );
  if (v.status === "changed")
    return (
      <Badge tone="amber">
        <IconAlert /> Source changed
      </Badge>
    );
  if (v.status === "saved") return <Badge tone="slate">Saved check from {when(v.checkedAt)}</Badge>;
  return <Badge tone="slate">Source unavailable</Badge>;
}

// Plain-language explanation shown in an item's details.
export function VerificationNote({ r }: { r: ObligationResult }) {
  const v = r.verification;
  const parts: string[] = [];
  if (v?.status === "verified") parts.push(`We checked this against the official page ${when(v.checkedAt)} and the key facts still match.`);
  if (v?.status === "changed")
    parts.push(
      `The official page changed: it no longer says ${v.missing?.map((m) => `"${m}"`).join(", ") ?? "one of the key facts"}. This item may be out of date until we review it. Check the official source.`,
    );
  if (v?.status === "saved") parts.push(`We couldn't reach the official page just now. This is our last successful check, from ${when(v.checkedAt)}.`);
  if (v?.status === "unavailable") parts.push("We couldn't reach the official page to check this item. Check the official source.");
  if (r.valueSources?.length && r.coverage === "reviewed") parts.push("Amounts on this item are read from official pages on every check.");
  if (!parts.length) return null;
  return <p className={`text-xs ${v?.status === "changed" ? "font-medium text-amber-800" : "text-slate-500"}`}>{parts.join(" ")}</p>;
}

export function LiveStatusBar({ data, checking, onCheck }: { data: ObligationsResponse; checking: boolean; onCheck: () => void }) {
  const checks = data.results.map((r) => r.verification).filter((v): v is RuleVerification => !!v);
  const verified = checks.filter((v) => v.status === "verified").length;
  const changed = checks.filter((v) => v.status === "changed").length;
  const saved = data.sources.filter((s) => s.status === "saved");
  const down = data.sources.filter((s) => s.status === "unavailable");
  const busy = checking || data.refreshing;
  const allGood = !!data.liveRefreshedAt && !changed && !saved.length && !down.length;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-sm ${
        allGood ? "border-emerald-200 bg-emerald-50/60 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex gap-3">
        <span className="mt-0.5 shrink-0 text-base">{allGood ? <IconCheck /> : busy && !data.liveRefreshedAt ? <IconInfo /> : <IconAlert />}</span>
        <div className="space-y-0.5">
          {data.liveRefreshedAt ? (
            <p className="font-semibold">
              Checked live {when(data.liveRefreshedAt)}: {verified} of {checks.length} items match their official source.
            </p>
          ) : (
            <p className="font-semibold">{busy ? "Checking official sources now…" : "Not checked against official sources yet."}</p>
          )}
          {changed > 0 && (
            <p>
              {changed} {changed === 1 ? "source has" : "sources have"} changed. Those items are marked "Source changed" until we review them.
            </p>
          )}
          {saved.map((s) => (
            <p key={s.id}>
              Showing saved results from {s.fetchedAt ? when(s.fetchedAt) : "an earlier check"} for {s.name} (couldn't reach it just now).
            </p>
          ))}
          {down.map((s) => (
            <p key={s.id}>{s.name} is unavailable, so amounts from it aren't shown. Check the official source.</p>
          ))}
          {allGood && <p>Wages, tax rates, and the FAMLI rate were read from official pages.</p>}
        </div>
      </div>
      <button onClick={onCheck} disabled={busy} className={buttonStyles.secondary}>
        {busy ? "Checking…" : "Check now"}
      </button>
    </div>
  );
}
