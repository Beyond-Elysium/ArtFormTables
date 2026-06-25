/** Small shared helpers for connector live paths. */
import "server-only";
import { format, subDays } from "date-fns";

export function dateNDaysAgo(n: number): string {
  return format(subDays(new Date(), n), "yyyy-MM-dd");
}

/** Current + previous equal-length windows ending today. */
export function rangeDates(days: number) {
  return {
    start: dateNDaysAgo(days - 1),
    end: dateNDaysAgo(0),
    prevStart: dateNDaysAgo(days * 2 - 1),
    prevEnd: dateNDaysAgo(days),
  };
}

/** Percentage change, guarding divide-by-zero. */
export function pct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

/** Coerce strings/undefined to a number. */
export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}
