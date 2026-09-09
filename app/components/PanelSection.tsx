"use client";

import { useMemo, useState } from "react";
import type {
  ConnectorResult,
  BreakdownPanel,
  MapPanel,
  TimeseriesPanel,
} from "@/lib/connectors/types";
import {
  applyTableView,
  INITIAL_TABLE_VIEW,
  nextSort,
  type SortKey,
  type TableViewState,
} from "@/lib/tableView";
import { formatValue } from "@/lib/format";
import { readableTextColor } from "@/lib/contrast";
import { breakdownCsv, csvFilename, timeseriesCsv } from "@/lib/csv";
import { StatCard } from "@/components/StatCard";
import { TimeseriesChart, DonutChart, BarChart, type Branding } from "@/components/Charts";
import { MapChart } from "@/components/MapChart";

/**
 * Renders one connector's result generically: KPI cards, then time series and
 * breakdowns. Works for any provider because it only knows about `Panel`s.
 */
export function PanelSection({
  result,
  brand,
  deltaSuffix,
  windowLabel,
}: {
  result: ConnectorResult;
  brand: Branding;
  /** Trailing context for KPI deltas, e.g. "vs prior 30d". */
  deltaSuffix?: string;
  /** Human label for the active date window (used in CSV export filenames). */
  windowLabel?: string;
}) {
  const stats = result.panels.filter((p) => p.kind === "stat");
  const rest = result.panels.filter((p) => p.kind !== "stat");

  // Cycle the ArtForm palette across KPI cards (left border + icon).
  const accents = [brand.primary, brand.accent, "#98d7eb", "#333333"];

  return (
    <section className="mb-4">
      <div className="d-flex align-items-center flex-wrap gap-2 mb-2 mt-4">
        <h2 className="section-title mb-0">{result.label}</h2>
        <span
          className="badge text-uppercase"
          style={{ background: brand.primary, color: readableTextColor(brand.primary) }}
        >
          {result.category}
        </span>
        {result.isMock && <span className="badge bg-orange-lt">demo data</span>}
      </div>

      {result.error && (
        <div className="text-secondary small mb-2">
          Sample data shown while this source is being connected.
        </div>
      )}

      {stats.length > 0 && (
        <div className="stat-grid">
          {stats.map((p, i) =>
            p.kind === "stat" ? (
              <StatCard
                key={i}
                label={p.label}
                value={formatValue(p.value, p.format, p.currency)}
                delta={p.delta}
                invertDelta={p.invertDelta}
                caption={p.caption}
                accentColor={accents[i % accents.length]}
                deltaSuffix={deltaSuffix}
                compareValue={
                  p.compareValue != null
                    ? formatValue(p.compareValue, p.format, p.currency)
                    : undefined
                }
              />
            ) : null,
          )}
        </div>
      )}

      {rest.length > 0 && (
        <div className="row row-cards mt-1">
          {rest.map((p, i) => {
            if (p.kind === "timeseries") {
              return (
                <div className="col-lg-8" key={i}>
                  <div
                    className="card h-100"
                    role="group"
                    aria-label={timeseriesAriaLabel(p)}
                  >
                    <div className="card-header d-flex align-items-start">
                      <div>
                        <h3 className="card-title mb-0">{p.title}</h3>
                        {p.subtitle && (
                          <div className="text-secondary small">{p.subtitle}</div>
                        )}
                      </div>
                      <CsvButton
                        panelTitle={p.title}
                        filename={csvFilename(result.label, p.title, windowLabel)}
                        buildCsv={() => timeseriesCsv(p.series)}
                      />
                    </div>
                    <div className="card-body">
                      <TimeseriesChart series={p.series} brand={brand} />
                    </div>
                  </div>
                </div>
              );
            }
            if (p.kind === "map") {
              return (
                <div className="col-lg-8" key={i}>
                  <div className="card h-100" role="group" aria-label={mapAriaLabel(p)}>
                    <div className="card-header d-flex align-items-start">
                      <div>
                        <h3 className="card-title mb-0">{p.title}</h3>
                        {p.subtitle && (
                          <div className="text-secondary small">{p.subtitle}</div>
                        )}
                      </div>
                      <CsvButton
                        panelTitle={p.title}
                        filename={csvFilename(result.label, p.title, windowLabel)}
                        // Map rows carry a region code alongside the name; reuse
                        // the breakdown serializer with the code as the detail.
                        buildCsv={() =>
                          breakdownCsv(
                            p.rows.map((r) => ({
                              label: r.label,
                              value: r.value,
                              sublabel: r.code,
                            })),
                            p.valueLabel,
                          )
                        }
                      />
                    </div>
                    <div className="card-body">
                      <MapChart panel={p} brand={brand} />
                    </div>
                  </div>
                </div>
              );
            }
            // Tables own their whole card: search/sort state lives inside, so
            // the CSV button has to live there too (it exports what you're
            // actually looking at, not the unfiltered rows).
            if (p.display === "table") {
              return (
                <div className="col-lg-4" key={i}>
                  <BreakdownTableCard
                    panel={p}
                    filename={csvFilename(result.label, p.title, windowLabel)}
                  />
                </div>
              );
            }
            const chartLabel = breakdownAriaLabel(p);
            return (
              <div className="col-lg-4" key={i}>
                <div className="card h-100" role="group" aria-label={chartLabel}>
                  <div className="card-header d-flex align-items-start">
                    <div>
                      <h3 className="card-title mb-0">{p.title}</h3>
                      {p.subtitle && (
                        <div className="text-secondary small">{p.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <div className="card-body">
                    {p.display === "bar" ? (
                      <BarChart rows={p.rows} brand={brand} />
                    ) : (
                      <DonutChart rows={p.rows} brand={brand} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Small ghost "CSV" button in a panel card header: serializes the panel's data
 * client-side (no server round-trip) and triggers a download. Hidden in print
 * mode so it never appears in PDF reports.
 */
function CsvButton({
  panelTitle,
  filename,
  buildCsv,
}: {
  panelTitle: string;
  filename: string;
  buildCsv: () => string;
}) {
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost-secondary ms-auto d-print-none"
      title="Download as CSV"
      aria-label={`Download ${panelTitle} as CSV`}
      onClick={() => downloadCsv(filename, buildCsv())}
    >
      CSV
    </button>
  );
}

/** Trigger a browser download of `csv` under `filename`. */
function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Screen-reader summary for a timeseries chart card: title, series, points. */
function timeseriesAriaLabel(p: TimeseriesPanel): string {
  const names = p.series.map((s) => s.name).join(", ");
  const points = p.series[0]?.points.length ?? 0;
  return `${p.title}. Line chart of ${names} over ${points} data points.`;
}

/** Screen-reader summary for a map card: the chart is inert to assistive tech,
 *  so the label carries the shape of the data and its top region. */
function mapAriaLabel(p: MapPanel): string {
  const scope = p.scope === "us" ? "United States" : "world";
  const top = [...p.rows].sort((a, b) => b.value - a.value)[0];
  const topText = top ? ` Highest: ${top.label}.` : "";
  return `${p.title}. Map of the ${scope} shading ${p.rows.length} regions by ${
    p.valueLabel ?? "value"
  }.${topText}`;
}

/** Screen-reader summary for a bar/donut chart card: title, kind, item count. */
function breakdownAriaLabel(p: BreakdownPanel): string {
  const kind = p.display === "bar" ? "Bar" : "Donut";
  const top = p.rows[0];
  const topText = top ? ` Largest: ${top.label}.` : "";
  return `${p.title}. ${kind} chart of ${p.rows.length} items.${topText}`;
}

/** Show search/sort/paging only once a table is big enough to need them. */
const CONTROLS_THRESHOLD = 5;

/**
 * A breakdown table card: searchable, sortable, paged.
 *
 * The body scrolls at about five rows so a long table doesn't stretch the
 * card (the client ask: "limit to the top five, then scroll for more"), while
 * the pager handles tables longer than one page. Small tables render exactly
 * as before — no controls, no scrollbar — so this only shows up where it
 * earns its place.
 *
 * View state (search/sort/page) is deliberately local and resets on tab
 * switch; it's a reading aid, not something worth persisting to the URL.
 */
function BreakdownTableCard({ panel, filename }: { panel: BreakdownPanel; filename: string }) {
  const [view, setView] = useState<TableViewState>(INITIAL_TABLE_VIEW);
  const result = useMemo(() => applyTableView(panel.rows, view), [panel.rows, view]);
  const showControls = panel.rows.length > CONTROLS_THRESHOLD;
  const valueLabel = panel.valueLabel ?? "Value";

  const sortIndicator = (key: SortKey) =>
    view.sortKey === key ? (view.sortDir === "asc" ? " ↑" : " ↓") : "";
  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    view.sortKey === key ? (view.sortDir === "asc" ? "ascending" : "descending") : "none";

  function sortBy(key: SortKey) {
    // Re-sorting from page 3 should show the new top rows, not page 3 of them.
    setView((v) => ({ ...v, ...nextSort(v, key), page: 0 }));
  }

  return (
    <div className="card h-100">
      <div className="card-header d-flex align-items-start">
        <div>
          <h3 className="card-title mb-0">{panel.title}</h3>
          {panel.subtitle && <div className="text-secondary small">{panel.subtitle}</div>}
        </div>
        <CsvButton
          panelTitle={panel.title}
          filename={filename}
          // Exports what you're looking at (search applied, every page) —
          // not just the visible page, and not the unfiltered rows.
          buildCsv={() => breakdownCsv(result.matched, panel.valueLabel)}
        />
      </div>

      {showControls && (
        <div className="card-body border-bottom py-2 d-print-none">
          <input
            type="search"
            className="form-control form-control-sm"
            placeholder={`Search ${panel.rows.length} rows…`}
            aria-label={`Search ${panel.title}`}
            value={view.query}
            onChange={(e) => setView((v) => ({ ...v, query: e.target.value, page: 0 }))}
          />
        </div>
      )}

      <div className="table-responsive breakdown-scroll">
        <table className="table table-vcenter card-table">
          <thead>
            <tr>
              <th aria-sort={ariaSort("label")}>
                <button
                  type="button"
                  className="btn-table-sort d-print-none"
                  onClick={() => sortBy("label")}
                >
                  Name{sortIndicator("label")}
                </button>
                <span className="d-none d-print-inline">Name</span>
              </th>
              <th className="text-end" aria-sort={ariaSort("value")}>
                <button
                  type="button"
                  className="btn-table-sort d-print-none"
                  onClick={() => sortBy("value")}
                >
                  {valueLabel}
                  {sortIndicator("value")}
                </button>
                <span className="d-none d-print-inline">{valueLabel}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={`${r.label}-${i}`}>
                <td>
                  <div className="fw-bold text-truncate" style={{ maxWidth: 220 }} title={r.label}>
                    {r.label}
                  </div>
                  {r.sublabel && (
                    <div
                      className="text-secondary small text-truncate"
                      style={{ maxWidth: 220 }}
                      title={r.sublabel}
                    >
                      {r.sublabel}
                    </div>
                  )}
                </td>
                <td className="text-end">
                  {formatValue(r.value, panel.valueFormat ?? "number")}
                </td>
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={2} className="text-secondary text-center py-3">
                  No rows match “{view.query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result.pageCount > 1 && (
        <div className="card-footer d-flex align-items-center justify-content-between py-2 d-print-none">
          <span className="text-secondary small">
            Page {result.page + 1} of {result.pageCount} · {result.total} rows
          </span>
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn"
              disabled={result.page === 0}
              onClick={() => setView((v) => ({ ...v, page: result.page - 1 }))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn"
              disabled={result.page >= result.pageCount - 1}
              onClick={() => setView((v) => ({ ...v, page: result.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
