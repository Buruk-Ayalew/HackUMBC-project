// Dates are stored as YYYY-MM-DD. Treat them as local calendar days.

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export function daysUntil(iso: string): number {
  return Math.round((parseDay(iso).getTime() - parseDay(todayIso()).getTime()) / 86_400_000);
}

export function formatDate(iso: string): string {
  return parseDay(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysLabel(iso: string): string {
  const n = daysUntil(iso);
  if (n < 0) return "passed";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
