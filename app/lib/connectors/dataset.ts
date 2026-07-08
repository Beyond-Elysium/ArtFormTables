/**
 * Dataset contract — the "connect anything" bridge from connectors to the
 * semantic layer.
 *
 * A connector already returns aggregated `Panel`s for display. To ALSO power
 * cross-filtering / drill-down / blended metrics, it can optionally expose a
 * **dataset**: finer-grained rows (a time dimension × other dimensions × raw
 * measures) plus a declarative `DatasetSpec`.
 *
 * The pipeline (see /semantic) materializes `fetchRows()` output to
 * `data/<client>/<model>.parquet` and writes a matching `specs/<model>.yaml`,
 * after which DuckDB + boring-semantic-layer make it queryable with no further
 * code. Adding a source = implement `DatasetProvider` (spec + fetchRows).
 *
 * This is intentionally additive: connectors without a dataset simply don't
 * feed the semantic layer.
 */
import "server-only";

/** A row of a dataset — flat scalars keyed by column name. */
export type DatasetRow = Record<string, string | number | boolean | null>;

/** How a measure column is aggregated (maps to an ibis/BSL expression). */
export type Aggregation = "sum" | "avg" | "min" | "max" | "count" | "count_distinct";

export interface MeasureSpec {
  /** Column to aggregate (omit for count). */
  column?: string;
  agg: Aggregation;
  description?: string;
}

/** Declarative model definition — compiles to a semantic spec (specs/*.yaml). */
export interface DatasetSpec {
  /** Semantic model name, e.g. "ga4", "ad_spend". */
  model: string;
  /** Time-series grain of the rows. */
  grain: "hour" | "day" | "week" | "month";
  /** The time-dimension column (ISO date string). */
  timeColumn: string;
  /** Non-time dimension columns to slice by. */
  dimensions: string[];
  /** Named measures → aggregation over a column. */
  measures: Record<string, MeasureSpec>;
  description?: string;
}

export interface DatasetContext {
  /** Client slug the rows belong to (becomes the `client` partition/dimension). */
  client: string;
  /** Inclusive window to extract. */
  start: string;
  end: string;
}

/**
 * A connector that can feed the semantic layer. `datasetSpec` declares the
 * shape; `fetchRows` returns the grain-level rows for a client + window.
 */
export interface DatasetProvider<Config = Record<string, unknown>> {
  datasetSpec: DatasetSpec;
  fetchRows(config: Config, ctx: DatasetContext): Promise<DatasetRow[]>;
}

/** Narrow a connector to a DatasetProvider if it implements the contract. */
export function hasDataset(x: unknown): x is DatasetProvider {
  return (
    typeof x === "object" &&
    x !== null &&
    "datasetSpec" in x &&
    typeof (x as DatasetProvider).fetchRows === "function"
  );
}
