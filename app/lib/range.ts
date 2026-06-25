/**
 * Date-range + comparison resolution. Pure and framework-agnostic so both the
 * server page and the client controls can share it. Operates on YYYY-MM-DD
 * date-only strings via date-fns (calendar-correct day/month/year math).
 */
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  subYears,
} from "date-fns";

export type RangePresetId = "7d" | "28d" | "90d" | "6mo" | "12mo" | "custom";
export type CompareMode = "none" | "previous" | "year";

export interface RangePreset {
  id: RangePresetId;
  label: string;
  /** Window length in days; undefined for "custom". */
  days?: number;
}

export const RANGE_PRESETS: RangePreset[] = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "28d", label: "28 days", days: 28 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "6mo", label: "6 months", days: 182 },
  { id: "12mo", label: "12 months", days: 365 },
  { id: "custom", label: "Custom" },
];

export const COMPARE_OPTIONS: { id: CompareMode; label: string }[] = [
  { id: "none", label: "No comparison" },
  { id: "previous", label: "Previous period" },
  { id: "year", label: "Previous year" },
];

/** A concrete, resolved window. */
export interface Window {
  /** Stable key used as a mock seed and cache key. */
  key: string;
  /** Inclusive bounds, YYYY-MM-DD. */
  start: string;
  end: string;
  days: number;
}

export interface ResolvedRange {
  preset: RangePresetId;
  window: Window;
  compareMode: CompareMode;
  /** Present when compareMode !== "none". */
  compare?: Window;
}

/* ----------------------------- date helpers ---------------------------- */
// Operate on date-only strings via date-fns. parseISO + format("yyyy-MM-dd")
// are calendar-correct (addDays handles month/year/DST boundaries).

const ISO = "yyyy-MM-dd";

export function todayISO(): string {
  return format(new Date(), ISO);
}
function shift(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), ISO);
}
/** Inclusive number of days between two ISO dates. */
function inclusiveDays(start: string, end: string): number {
  return Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1);
}

/** Every ISO date in a window, oldest first (length === window.days). */
export function windowDates(w: Window): string[] {
  const out: string[] = [];
  for (let i = 0; i < w.days; i++) out.push(shift(w.start, i));
  return out;
}

/* ------------------------------ resolution ----------------------------- */

export interface RangeParams {
  range?: string;
  from?: string;
  to?: string;
  compare?: string;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(params: RangeParams): ResolvedRange {
  const today = todayISO();

  let preset: RangePresetId =
    (RANGE_PRESETS.find((p) => p.id === params.range)?.id as RangePresetId) ?? "28d";

  let start: string;
  let end: string;

  const hasCustom = !!params.from && !!params.to && ISO_RE.test(params.from) && ISO_RE.test(params.to);
  if (preset === "custom" || (hasCustom && !params.range)) {
    if (hasCustom) {
      // Normalize order.
      start = params.from! <= params.to! ? params.from! : params.to!;
      end = params.from! <= params.to! ? params.to! : params.from!;
      // Clamp end to today.
      if (end > today) end = today;
      preset = "custom";
    } else {
      // "custom" requested without valid dates → fall back to 28d.
      preset = "28d";
      end = today;
      start = shift(today, -27);
    }
  } else {
    const days = RANGE_PRESETS.find((p) => p.id === preset)?.days ?? 28;
    end = today;
    start = shift(today, -(days - 1));
  }

  const days = inclusiveDays(start, end);
  const window: Window = { key: `${start}_${end}`, start, end, days };

  const compareMode: CompareMode =
    (COMPARE_OPTIONS.find((c) => c.id === params.compare)?.id as CompareMode) ?? "none";

  let compare: Window | undefined;
  if (compareMode === "previous") {
    const cEnd = shift(start, -1);
    const cStart = shift(cEnd, -(days - 1));
    compare = { key: `${cStart}_${cEnd}`, start: cStart, end: cEnd, days };
  } else if (compareMode === "year") {
    // subYears handles leap years correctly (vs a flat -365).
    const cStart = format(subYears(parseISO(start), 1), "yyyy-MM-dd");
    const cEnd = format(subYears(parseISO(end), 1), "yyyy-MM-dd");
    const cDays = inclusiveDays(cStart, cEnd);
    compare = { key: `${cStart}_${cEnd}`, start: cStart, end: cEnd, days: cDays };
  }

  return { preset, window, compareMode, compare };
}

/* ------------------------------ formatting ----------------------------- */

/** "Jun 1 – Jun 28, 2026" (drops the year on the start when it matches the end). */
export function formatWindow(w: Window): string {
  const s = parseISO(w.start);
  const e = parseISO(w.end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const left = format(s, sameYear ? "MMM d" : "MMM d, yyyy");
  return `${left} – ${format(e, "MMM d, yyyy")}`;
}
