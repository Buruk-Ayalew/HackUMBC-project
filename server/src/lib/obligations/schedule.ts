import type { DueDate, ObligationRule, RecurringSchedule } from "../../../../shared/types.js";

// Due-date math for recurring filings. All dates are plain calendar days
// (YYYY-MM-DD), computed in UTC to avoid time-zone drift.
// IRS, Comptroller, and MD Labor all move a due date that falls on a weekend
// or legal holiday to the next business day. We apply weekends and federal
// holidays; state-only holidays are not applied (noted in the UI).

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// nth weekday (0=Sun) of a month; n = -1 for the last one.
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = utc(y, m, 1).getUTCDay();
    return iso(utc(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7));
  }
  const lastDay = lastDayOfMonth(y, m);
  const last = utc(y, m, lastDay).getUTCDay();
  return iso(utc(y, m, lastDay - ((last - weekday + 7) % 7)));
}

// Fixed-date holidays move to Friday/Monday when they fall on a weekend.
function observed(y: number, m: number, d: number): string {
  const date = utc(y, m, d);
  const dow = date.getUTCDay();
  if (dow === 6) date.setUTCDate(d - 1);
  if (dow === 0) date.setUTCDate(d + 1);
  return iso(date);
}

const holidayCache = new Map<number, Set<string>>();

export function federalHolidays(y: number): Set<string> {
  let set = holidayCache.get(y);
  if (!set) {
    set = new Set([
      observed(y, 1, 1), // New Year's Day
      nthWeekday(y, 1, 1, 3), // Martin Luther King Jr. Day
      nthWeekday(y, 2, 1, 3), // Washington's Birthday
      nthWeekday(y, 5, 1, -1), // Memorial Day
      observed(y, 6, 19), // Juneteenth
      observed(y, 7, 4), // Independence Day
      nthWeekday(y, 9, 1, 1), // Labor Day
      nthWeekday(y, 10, 1, 2), // Columbus Day
      observed(y, 11, 11), // Veterans Day
      nthWeekday(y, 11, 4, 4), // Thanksgiving
      observed(y, 12, 25), // Christmas
    ]);
    holidayCache.set(y, set);
  }
  return set;
}

export function nextBusinessDay(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  for (;;) {
    const dow = d.getUTCDay();
    const s = iso(d);
    if (dow !== 0 && dow !== 6 && !federalHolidays(d.getUTCFullYear()).has(s)) return s;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function dayIn(y: number, m: number, day: number | "last"): Date {
  return utc(y, m, day === "last" ? lastDayOfMonth(y, m) : Math.min(day, lastDayOfMonth(y, m)));
}

// Raw (unadjusted) due dates with their period names, from about a year
// before `from` to `months` after it.
function rawOccurrences(s: RecurringSchedule, fromYear: number): { date: Date; period: string }[] {
  const out: { date: Date; period: string }[] = [];
  for (let y = fromYear - 1; y <= fromYear + 2; y++) {
    if (s.every === "year") {
      out.push({ date: dayIn(y, s.month ?? 1, s.day), period: String(y) });
    } else if (s.every === "quarter") {
      for (let q = 1; q <= 4; q++) {
        const endMonth = q * 3; // Mar, Jun, Sep, Dec
        const dueY = endMonth === 12 ? y + 1 : y;
        const dueM = endMonth === 12 ? 1 : endMonth + 1;
        out.push({ date: dayIn(dueY, dueM, s.day), period: `Q${q} ${y}` });
      }
    } else {
      for (let m = 1; m <= 12; m++) {
        const dueY = m === 12 ? y + 1 : y;
        const dueM = m === 12 ? 1 : m + 1;
        out.push({ date: dayIn(dueY, dueM, s.day), period: `${MONTHS[m - 1]} ${y}` });
      }
    }
  }
  return out;
}

// Due dates between `today` and `until` (inclusive), adjusted to business days.
export function recurringDates(s: RecurringSchedule, today: string, until: string): DueDate[] {
  const fromYear = Number(today.slice(0, 4));
  return rawOccurrences(s, fromYear)
    .map((o) => ({ date: nextBusinessDay(iso(o.date)), label: s.label.replace("{period}", o.period) }))
    .filter((o) => o.date >= today && o.date <= until && (!s.startsOn || o.date >= s.startsOn))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function addMonths(dateIso: string, months: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return iso(d);
}

// All due dates for a rule in the window [today, today + 12 months], plus any
// one-time deadlines from today on. One-time deadlines are shown as written.
export function upcomingDates(rule: ObligationRule, today: string, months = 12): DueDate[] {
  const until = addMonths(today, months);
  const oneTime = (rule.deadlines ?? []).filter((d) => d.date >= today).map((d) => ({ date: d.date, label: d.label }));
  const recurring = rule.recurring ? recurringDates(rule.recurring, today, until) : [];
  const seen = new Set<string>();
  return [...oneTime, ...recurring]
    .filter((d) => {
      const k = `${d.date}|${d.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
