/**
 * Pure query-building + URL-state helpers for the Explore experience.
 *
 * Kept framework-agnostic (no React, no nuqs) so the interaction logic —
 * translating a user's model/dimension/measure/filter selections into a
 * SemanticQuery, and (de)serialising cross-filters to a compact URL string —
 * is testable in isolation. The Explore client component wires these to nuqs
 * URL state and the /api/semantic proxy.
 */
import type { SemanticQuery, SemanticFilter } from "@/lib/semantic";

/** A single equality cross-filter (drill-down): dimension = value. */
export interface ExploreFilter {
  field: string;
  value: string;
}

export interface ExploreState {
  model: string;
  /** Group-by dimensions. */
  dimensions: string[];
  measures: string[];
  filters: ExploreFilter[];
  /** Inclusive time-range bounds (YYYY-MM-DD); empty string = unbounded. */
  from?: string;
  to?: string;
  /** The model's time dimension, when known (drives ordering + chart choice). */
  timeDimension?: string | null;
}

const PAIR = ";";
const KV = ":";

/** Serialise cross-filters to a compact, URL-safe string (each part encoded). */
export function encodeFilters(filters: ExploreFilter[]): string {
  return filters
    .map((f) => `${encodeURIComponent(f.field)}${KV}${encodeURIComponent(f.value)}`)
    .join(PAIR);
}

/** Parse the filters string produced by encodeFilters (tolerant of junk). */
export function decodeFilters(raw: string | null | undefined): ExploreFilter[] {
  if (!raw) return [];
  const out: ExploreFilter[] = [];
  for (const part of raw.split(PAIR)) {
    if (!part) continue;
    const idx = part.indexOf(KV);
    if (idx < 0) continue;
    const field = decodeURIComponent(part.slice(0, idx));
    const value = decodeURIComponent(part.slice(idx + 1));
    if (field) out.push({ field, value });
  }
  return out;
}

/**
 * Toggle an equality cross-filter. Clicking a value that's already the active
 * filter for its field clears it; otherwise it replaces any existing filter on
 * that field (so a click always narrows to one value per dimension).
 */
export function toggleFilter(
  filters: ExploreFilter[],
  field: string,
  value: string,
): ExploreFilter[] {
  const active = filters.find((f) => f.field === field);
  if (active && active.value === value) {
    return filters.filter((f) => f.field !== field);
  }
  return [...filters.filter((f) => f.field !== field), { field, value }];
}

/** Set (add or replace) an equality filter on a field — never removes. */
export function setFilter(
  filters: ExploreFilter[],
  field: string,
  value: string,
): ExploreFilter[] {
  return [...filters.filter((f) => f.field !== field), { field, value }];
}

/**
 * Drill into a table row: set an equality filter for every field/value pair in
 * the row. Unlike toggleFilter this always narrows (clicking a row you're
 * already inside is a no-op, not a toggle-off).
 */
export function filtersFromRow(
  filters: ExploreFilter[],
  pairs: ExploreFilter[],
): ExploreFilter[] {
  let next = filters;
  for (const p of pairs) next = setFilter(next, p.field, p.value);
  return next;
}

/** Does this view render as a timeseries (grouped by the time dimension)? */
export function isTimeseries(
  state: Pick<ExploreState, "dimensions" | "timeDimension">,
): boolean {
  return Boolean(state.timeDimension && state.dimensions.includes(state.timeDimension));
}

/**
 * Translate Explore state into a SemanticQuery for the /query endpoint.
 * Orders by the time dimension ascending for timeseries, else by the first
 * measure descending (biggest-first bars/tables), else the first dimension.
 */
export function buildExploreQuery(state: ExploreState): SemanticQuery {
  const { model, dimensions, measures } = state;

  const filters: SemanticFilter[] = state.filters.map((f) => ({
    field: f.field,
    op: "=",
    value: f.value,
  }));

  const hasRange = Boolean(state.from || state.to);
  const timeRange = hasRange
    ? { start: state.from || undefined, end: state.to || undefined }
    : undefined;

  let orderBy: [string, "asc" | "desc"][] = [];
  if (isTimeseries(state)) {
    orderBy = [[state.timeDimension as string, "asc"]];
  } else if (measures.length) {
    orderBy = [[measures[0], "desc"]];
  } else if (dimensions.length) {
    orderBy = [[dimensions[0], "asc"]];
  }

  return {
    model,
    dimensions,
    measures,
    filters,
    timeRange,
    orderBy,
    limit: 500,
  };
}
