/**
 * Pure date-window helpers for live connector fetches.
 *
 * The orchestrator resolves the user's range into explicit inclusive bounds
 * (`ConnectorContext.start` / `.end`, YYYY-MM-DD). Live connectors must honor
 * those — building their own trailing-N-days windows makes custom ranges fetch
 * the wrong dates, and makes comparison mode fetch the same trailing window
 * twice (deltas collapse to ~0). These helpers centralize the math:
 *
 *   - `resolveWindow(ctx)`   → the effective window (explicit dates when
 *     present, trailing `days` ending today as the legacy fallback).
 *   - `previousWindow(w)`    → the immediately-preceding window of equal
 *     length, used for each connector's own period-over-period delta.
 *   - `clampWindowEnd(w, max)` → shrink a window whose end is later than a
 *     provider's data-latency horizon (e.g. Search Console is only final
 *     ~today-2).
 *
 * Kept dependency-light and side-effect-free so they're unit-testable without
 * any API clients.
 */
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";

const ISO = "yyyy-MM-dd";

export interface DateWindow {
  /** Inclusive bounds, YYYY-MM-DD. */
  start: string;
  end: string;
  /** Inclusive day count (end - start + 1). */
  days: number;
}

/** Today - n as YYYY-MM-DD (n = 0 → today). Server-local date. */
export function dateNDaysAgo(n: number, from: Date = new Date()): string {
  return format(subDays(from, n), ISO);
}

function shift(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), ISO);
}

/** Inclusive number of days between two ISO dates (min 1). */
export function inclusiveDays(start: string, end: string): number {
  return Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1);
}

/**
 * The effective fetch window for a connector context: the explicit
 * `start`/`end` when both are present (custom ranges, comparison windows),
 * otherwise the trailing `days`-day window ending today (legacy behavior).
 */
export function resolveWindow(
  ctx: { days: number; start?: string; end?: string },
  today: Date = new Date(),
): DateWindow {
  if (ctx.start && ctx.end) {
    return { start: ctx.start, end: ctx.end, days: inclusiveDays(ctx.start, ctx.end) };
  }
  const end = dateNDaysAgo(0, today);
  const start = dateNDaysAgo(ctx.days - 1, today);
  return { start, end, days: ctx.days };
}

/** The immediately-preceding window of equal length (for per-stat deltas). */
export function previousWindow(w: DateWindow): DateWindow {
  const end = shift(w.start, -1);
  const start = shift(end, -(w.days - 1));
  return { start, end, days: w.days };
}

/**
 * Clamp a window's end date to `maxEnd` (data-latency horizon). Only the end
 * moves: the requested start is preserved so labels stay honest, and the last
 * not-yet-final buckets are simply excluded instead of read as zeros. If the
 * whole window is later than `maxEnd`, it collapses to the single day `maxEnd`.
 */
export function clampWindowEnd(w: DateWindow, maxEnd: string): DateWindow {
  if (w.end <= maxEnd) return w;
  const start = w.start <= maxEnd ? w.start : maxEnd;
  return { start, end: maxEnd, days: inclusiveDays(start, maxEnd) };
}

/** Keep only rows whose ISO date falls inside the window (inclusive). */
export function filterByWindow<T extends { x: string }>(rows: T[], w: DateWindow): T[] {
  return rows.filter((r) => r.x >= w.start && r.x <= w.end);
}
