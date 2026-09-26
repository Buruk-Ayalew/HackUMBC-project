import type { ObligationResult, ObligationsResponse, RuleVerification } from "../../../shared/types";
import { IconAlert, IconCheck } from "./icons";
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

// Items only get a label when something needs attention; a passing check is
// shown once, at the top of the page.
export function needsBadge(v?: RuleVerification): v is RuleVerification {
  return !!v && v.status !== "verified";
}

export function VerificationBadge({ v }: { v?: RuleVerification }) {
  if (!needsBadge(v)) return null;
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
  const changed = checks.filter((v) => v.status === "changed").length;
  const saved = data.sources.filter((s) => s.status === "saved");
  const down = data.sources.filter((s) => s.status === "unavailable");
  const busy = checking || data.refreshing;
  const allGood = !!data.liveRefreshedAt && !changed && !saved.length && !down.length;

  const issues: string[] = [];
  if (changed) issues.push(`${changed} ${changed === 1 ? "source has" : "sources have"} changed (marked below)`);
  for (const s of saved) issues.push(`showing saved results from ${s.fetchedAt ? when(s.fetchedAt) : "an earlier check"} for ${s.name}`);
  for (const s of down) issues.push(`${s.name} is unavailable`);

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${allGood ? "text-slate-500" : "text-amber-800"}`}>
      <span className="inline-flex items-center gap-1.5">
        {allGood ? <IconCheck className="text-emerald-600" /> : <IconAlert />}
        {data.liveRefreshedAt
          ? `Checked Live ${when(data.liveRefreshedAt).replace(/^today/, "Today")}`
          : busy
            ? "Checking official sources…"
            : "Not checked against official sources yet"}
        {issues.length > 0 && `: ${issues.join("; ")}.`}
      </span>
      <button
        onClick={onCheck}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 disabled:opacity-60"
      >
        {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" aria-hidden />}
        {busy ? "Checking…" : "Check Now"}
      </button>
    </div>
  );
}
