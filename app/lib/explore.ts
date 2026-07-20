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
  /** Sort the result by this measure, descending (categorical views only). */
  sortBy?: string;
  /** Row cap ("Top N") for categorical views; timeseries always gets 500. */
  limit?: number;
}

/** Row-cap choices offered by the Explore UI. */
export const LIMIT_OPTIONS = [20, 50, 100] as const;

/** Hard ceiling on rows requested from the semantic layer. */
export const MAX_LIMIT = 500;

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
 * Orders by the time dimension ascending for timeseries, else by the chosen
 * sort measure (or the first measure) descending — biggest-first bars/tables
 * — else the first dimension. `limit` caps categorical views ("Top N");
 * timeseries always requests the full window (up to MAX_LIMIT).
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

  const timeseries = isTimeseries(state);

  let orderBy: [string, "asc" | "desc"][] = [];
  if (timeseries) {
    orderBy = [[state.timeDimension as string, "asc"]];
  } else if (measures.length) {
    // A stale sortBy (its measure was deselected) falls back to the first measure.
    const sortMeasure =
      state.sortBy && measures.includes(state.sortBy) ? state.sortBy : measures[0];
    orderBy = [[sortMeasure, "desc"]];
  } else if (dimensions.length) {
    orderBy = [[dimensions[0], "asc"]];
  }

  const limit =
    !timeseries && state.limit
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(state.limit)))
      : MAX_LIMIT;

  return {
    model,
    dimensions,
    measures,
    filters,
    timeRange,
    orderBy,
    limit,
  };
}
