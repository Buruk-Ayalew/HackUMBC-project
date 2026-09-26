import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconAlert, IconInfo } from "./icons";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-card ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeading({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl text-brand-600">{icon}</span>}
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type Tone = "red" | "amber" | "green" | "blue" | "slate" | "brand";

const TONES: Record<Tone, string> = {
  red: "bg-rose-50 text-rose-700 ring-rose-600/15",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/10",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15",
};

export function Badge({ tone = "slate", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "blue" | "red"; children: ReactNode }) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    red: "border-rose-200 bg-rose-50 text-rose-800",
  }[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <span className="mt-0.5 shrink-0 text-base">{tone === "blue" ? <IconInfo /> : <IconAlert />}</span>
      <div>{children}</div>
    </div>
  );
}

export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50",
  ghost: "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50",
};

export function LinkButton({ to, variant = "primary", children }: { to: string; variant?: keyof typeof buttonStyles; children: ReactNode }) {
  return (
    <Link to={to} className={buttonStyles[variant]}>
      {children}
    </Link>
  );
}

export function Stat({ value, label, tone = "slate" }: { value: ReactNode; label: string; tone?: "red" | "amber" | "slate" | "brand" }) {
  const color = { red: "text-rose-600", amber: "text-amber-600", slate: "text-slate-900", brand: "text-brand-600" }[tone];
  return (
    <div>
      <p className={`text-3xl font-bold tracking-tight ${color}`}>{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
}

export function LoadingPage() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-28" />
      <Skeleton className="h-64" />
    </div>
  );
}
