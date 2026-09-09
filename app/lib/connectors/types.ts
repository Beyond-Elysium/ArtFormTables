/**
 * Connector framework — provider-agnostic contract.
 *
 * Every data source (GA4, Search Console, Google Ads, Bing, or anything with an
 * API) implements `Connector`. A connector's only job is to turn its own API's
 * response into a normalized list of `Panel`s. The dashboard renders panels
 * generically, so adding a new provider never touches the UI.
 */
import "server-only";

export type DateRangePreset = "7d" | "28d" | "90d";

export const PRESET_DAYS: Record<DateRangePreset, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

/** How a numeric value should be formatted for display. */
export type StatFormat =
  | "number"
  | "compact"
  | "percent" // value is a 0..1 ratio
  | "decimal" // one decimal place (e.g. avg. position)
  | "currency"
  | "duration"; // value is seconds

/** A single headline metric (KPI card). */
export interface StatPanel {
  kind: "stat";
  label: string;
  value: number;
  format: StatFormat;
  /** % change vs the previous equal-length period. */
  delta?: number;
  /** When true, a positive delta is shown as bad (e.g. cost, avg position). */
  invertDelta?: boolean;
  currency?: string;
  /** Comparison-period value, attached by the orchestrator when comparing. */
  compareValue?: number;
  /** Caption shown when there's no delta (e.g. "Avg over period"). */
  caption?: string;
}

/** A time series with one or more lines. */
export interface TimeseriesPanel {
  kind: "timeseries";
  title: string;
  /** Optional muted line under the title. */
  subtitle?: string;
  series: { name: string; points: { x: string; y: number }[]; dashed?: boolean }[];
}

/** A ranked breakdown (sources, queries, campaigns…). */
export interface BreakdownPanel {
  kind: "breakdown";
  title: string;
  /** Optional muted line under the title. */
  subtitle?: string;
  display: "donut" | "bar" | "table";
  valueLabel?: string;
  valueFormat?: StatFormat;
  rows: { label: string; value: number; sublabel?: string }[];
}

/** A geographic distribution, drawn as a choropleth map. */
export interface MapPanel {
  kind: "map";
  title: string;
  /** Optional muted line under the title. */
  subtitle?: string;
  /**
   * Which map to draw, and therefore which code space `rows[].code` uses:
   *   - `world` → ISO 3166-1 alpha-2 country codes (`US`, `GB`)
   *   - `us`    → ISO 3166-2 state codes (`US-VA`, `US-CA`)
   * See components/maps/README.md.
   */
  scope: "world" | "us";
  valueLabel?: string;
  valueFormat?: StatFormat;
  rows: { code: string; label: string; value: number }[];
}

export type Panel = StatPanel | TimeseriesPanel | BreakdownPanel | MapPanel;

/** What a connector returns: a labelled group of panels. */
export interface ConnectorResult {
  /** Stable id for the source instance (connector type by default). */
  sourceId: string;
  /**
   * Connector type of the registry source (set by the orchestrator; connectors
   * themselves don't fill it). Lets custom views select sources by type.
   */
  type?: string;
  /** Human label shown as the section heading. */
  label: string;
  /** Grouping/category, e.g. "Analytics", "Search", "Advertising". */
  category: string;
  panels: Panel[];
  /** True when the data is sample/mock rather than live. */
  isMock: boolean;
  /** Set when a live fetch failed (data falls back to mock). */
  error?: string;
}

export interface ConnectorContext {
  /** Seed/label key for the active window (preset id or a custom range key). */
  range: string;
  /** Number of days in the window. */
  days: number;
  /**
   * Inclusive window bounds (YYYY-MM-DD). Live connectors MUST fetch exactly
   * this window when both are present (see lib/connectors/dates.ts —
   * `resolveWindow`/`previousWindow`); trailing-`days` windows ending today are
   * only the fallback when bounds are absent. This is what makes custom ranges
   * and comparison windows fetch the right dates on live data.
   */
  start?: string;
  end?: string;
}

/**
 * The contract every provider implements. `Config` is the per-client,
 * type-specific configuration stored in the client registry (e.g.
 * `{ propertyId }` for GA4, `{ siteUrl }` for Search Console).
 */
export interface Connector<Config = Record<string, unknown>> {
  type: string;
  label: string;
  category: string;
  /** Returns true when live credentials/config are present for this source. */
  isLive(config: Config): boolean;
  fetch(config: Config, ctx: ConnectorContext): Promise<ConnectorResult>;
}
