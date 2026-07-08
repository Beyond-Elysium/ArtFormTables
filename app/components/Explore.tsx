"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryStates } from "nuqs";
import { parseAsArrayOf, parseAsString } from "nuqs";
import { IconX, IconFilterOff, IconTable, IconChartBar } from "@tabler/icons-react";
import type { Branding } from "@/components/Charts";
import { BarChart, TimeseriesChart } from "@/components/Charts";
import type { SemanticModelSchema, SemanticResult } from "@/lib/semantic";
import {
  buildExploreQuery,
  decodeFilters,
  encodeFilters,
  filtersFromRow,
  isTimeseries,
  toggleFilter,
  type ExploreFilter,
} from "@/lib/explore";
import { formatNumber } from "@/lib/format";

type ModelMap = Record<string, SemanticModelSchema>;

// All Explore state lives in the URL (shallow: the client re-queries the proxy
// itself, so there's no server component to re-run). This keeps every view —
// model, group-bys, measures, cross-filters, range — shareable via the link.
const exploreParsers = {
  model: parseAsString.withDefault(""),
  dims: parseAsArrayOf(parseAsString).withDefault([]),
  measures: parseAsArrayOf(parseAsString).withDefault([]),
  filters: parseAsString.withDefault(""),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
};

/** Format a measure cell: integers compactly, ratios/small values with decimals. */
function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value !== "number") return String(value);
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return formatNumber(value);
  if (Math.abs(value) < 1) return value.toFixed(3);
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function ExploreClient({ brand }: { brand: Branding }) {
  const [{ model, dims, measures, filters, from, to }, setState] = useQueryStates(
    exploreParsers,
    { shallow: true, scroll: false, history: "push" },
  );

  const [models, setModels] = useState<ModelMap | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [result, setResult] = useState<SemanticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const parsedFilters = useMemo(() => decodeFilters(filters), [filters]);
  const seeded = useRef(false);

  // Load the model schema through the token-injecting proxy (no credential here).
  useEffect(() => {
    let alive = true;
    fetch("/api/semantic/models")
      .then(async (r) => {
        if (!r.ok) throw new Error(`schema ${r.status}`);
        return (await r.json()) as ModelMap;
      })
      .then((m) => {
        if (alive) setModels(m);
      })
      .catch((e) => {
        if (alive) setSchemaError(String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const modelNames = models ? Object.keys(models) : [];
  const activeModel = model || modelNames[0] || "";
  const schema = models?.[activeModel] ?? null;
  const timeDimension = schema?.time_dimension ?? null;

  // Seed a sensible first view once the schema loads (timeseries of the first
  // measure) — written to the URL so the selection is reflected + shareable.
  useEffect(() => {
    if (seeded.current || !schema) return;
    seeded.current = true;
    if (!model || dims.length === 0 || measures.length === 0) {
      setState({
        model: activeModel,
        dims: dims.length ? dims : timeDimension ? [timeDimension] : schema.dimensions.slice(0, 1),
        measures: measures.length ? measures : schema.measures.slice(0, 1),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const dimensions = dims;

  // Run the query whenever the (URL) state changes. AbortController drops the
  // response of a superseded request so fast clicks don't race.
  useEffect(() => {
    if (!schema || !activeModel) return;
    const q = buildExploreQuery({
      model: activeModel,
      dimensions,
      measures,
      filters: parsedFilters,
      from,
      to,
      timeDimension,
    });
    const ctrl = new AbortController();
    setLoading(true);
    setQueryError(null);
    fetch("/api/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(q),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`query ${r.status}`);
        return (await r.json()) as SemanticResult;
      })
      .then((res) => setResult(res))
      .catch((e) => {
        if (e.name !== "AbortError") setQueryError(String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModel, dims.join(","), measures.join(","), filters, from, to, schema]);

  const applyFilters = useCallback(
    (next: ExploreFilter[]) => setState({ filters: encodeFilters(next) || null }),
    [setState],
  );

  function selectModel(next: string) {
    seeded.current = false; // re-seed defaults for the new model's schema
    const s = models?.[next];
    setState({
      model: next,
      dims: s?.time_dimension ? [s.time_dimension] : s?.dimensions.slice(0, 1) ?? [],
      measures: s?.measures.slice(0, 1) ?? [],
      filters: null,
    });
  }

  function toggleDim(dim: string) {
    const next = dimensions.includes(dim)
      ? dimensions.filter((d) => d !== dim)
      : [...dimensions, dim];
    setState({ dims: next.length ? next : null });
  }

  function toggleMeasure(m: string) {
    const next = measures.includes(m)
      ? measures.filter((x) => x !== m)
      : [...measures, m];
    setState({ measures: next.length ? next : null });
  }

  // ---- derived view data --------------------------------------------------
  const showTimeseries = isTimeseries({ dimensions, timeDimension });
  const primaryDim = dimensions[0];
  const primaryMeasure = measures[0];
  const rows = result?.rows ?? [];

  const barRows = useMemo(() => {
    if (showTimeseries || !primaryDim || !primaryMeasure) return [];
    return rows.slice(0, 20).map((r) => ({
      label: String(r[primaryDim] ?? ""),
      value: Number(r[primaryMeasure] ?? 0),
    }));
  }, [rows, showTimeseries, primaryDim, primaryMeasure]);

  const tsSeries = useMemo(() => {
    if (!showTimeseries || !timeDimension) return [];
    return measures.map((m) => ({
      name: m,
      points: rows.map((r) => ({ x: String(r[timeDimension]), y: Number(r[m] ?? 0) })),
    }));
  }, [rows, showTimeseries, timeDimension, measures]);

  // ---- render -------------------------------------------------------------
  if (schemaError) {
    return (
      <div className="empty">
        <p className="empty-title">Couldn&apos;t load the semantic schema</p>
        <p className="empty-subtitle text-secondary">{schemaError}</p>
      </div>
    );
  }
  if (!models) {
    return <div className="chart-skeleton" style={{ height: 200 }} />;
  }

  return (
    <div>
      {/* Query builder */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-md-3">
              <label className="form-label subheader">Model</label>
              <select
                className="form-select"
                value={activeModel}
                onChange={(e) => selectModel(e.target.value)}
              >
                {modelNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-5">
              <label className="form-label subheader">Group by</label>
              <div className="d-flex flex-wrap gap-1">
                {schema?.dimensions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`btn btn-sm ${
                      dimensions.includes(d) ? "btn-primary" : "btn-outline-primary"
                    }`}
                    onClick={() => toggleDim(d)}
                  >
                    {d}
                    {d === timeDimension ? " ⏱" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label subheader">Measures</label>
              <div className="d-flex flex-wrap gap-1">
                {schema?.measures.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`btn btn-sm ${
                      measures.includes(m) ? "btn-primary" : "btn-outline-primary"
                    }`}
                    onClick={() => toggleMeasure(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label subheader">From</label>
              <input
                type="date"
                className="form-control"
                value={from}
                onChange={(e) => setState({ from: e.target.value || null })}
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label subheader">To</label>
              <input
                type="date"
                className="form-control"
                value={to}
                onChange={(e) => setState({ to: e.target.value || null })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down breadcrumb of applied cross-filters */}
      <div className="explore-breadcrumb d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="subheader text-secondary">Filters:</span>
        {parsedFilters.length === 0 && (
          <span className="text-secondary small">
            none — click a bar or a table row to drill down
          </span>
        )}
        {parsedFilters.map((f) => (
          <button
            key={`${f.field}:${f.value}`}
            type="button"
            className="badge explore-chip d-inline-flex align-items-center gap-1"
            style={{ background: brand.primary, color: "#fff" }}
            onClick={() => applyFilters(toggleFilter(parsedFilters, f.field, f.value))}
            title="Remove filter"
          >
            {f.field} = {f.value}
            <IconX size={13} stroke={2.5} />
          </button>
        ))}
        {parsedFilters.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            onClick={() => applyFilters([])}
          >
            <IconFilterOff size={15} stroke={2} /> Clear
          </button>
        )}
      </div>

      {queryError && (
        <div className="alert mock-banner mb-3" role="alert">
          <strong>Query failed.</strong> {queryError}
        </div>
      )}

      {/* Chart */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center">
          <IconChartBar size={18} className="me-2" />
          <h3 className="section-title m-0">
            {showTimeseries ? "Trend" : primaryDim ? `By ${primaryDim}` : "Chart"}
          </h3>
          {loading && <span className="ms-auto text-secondary small">Loading…</span>}
        </div>
        <div className="card-body">
          {showTimeseries && tsSeries.length > 0 ? (
            <TimeseriesChart series={tsSeries} brand={brand} />
          ) : barRows.length > 0 ? (
            <BarChart
              rows={barRows}
              brand={brand}
              onSelect={(label) =>
                applyFilters(toggleFilter(parsedFilters, primaryDim, label))
              }
            />
          ) : (
            <div className="text-secondary text-center py-5">
              {loading ? "Loading…" : "Pick a dimension and a measure to see a chart."}
            </div>
          )}
          {!showTimeseries && primaryDim && barRows.length > 0 && (
            <div className="text-secondary small mt-2">
              Click a bar to filter on {primaryDim}.
            </div>
          )}
        </div>
      </div>

      {/* Result table */}
      <div className="card">
        <div className="card-header d-flex align-items-center">
          <IconTable size={18} className="me-2" />
          <h3 className="section-title m-0">Results</h3>
          <span className="ms-auto text-secondary small">{rows.length} rows</span>
        </div>
        <div className="table-responsive">
          <table className="table table-vcenter card-table">
            <thead>
              <tr>
                {(result?.columns ?? []).map((c) => (
                  <th key={c} className={dimensions.includes(c) ? "" : "text-end"}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rowFilters: ExploreFilter[] = dimensions
                  .filter((d) => d !== timeDimension)
                  .map((d) => ({ field: d, value: String(r[d]) }));
                const clickable = rowFilters.length > 0;
                return (
                  <tr
                    key={i}
                    className={clickable ? "explore-row" : ""}
                    onClick={
                      clickable
                        ? () => applyFilters(filtersFromRow(parsedFilters, rowFilters))
                        : undefined
                    }
                  >
                    {(result?.columns ?? []).map((c) => (
                      <td key={c} className={dimensions.includes(c) ? "" : "text-end"}>
                        {dimensions.includes(c) ? String(r[c] ?? "—") : formatCell(r[c])}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={Math.max(1, result?.columns?.length ?? 1)} className="text-center text-secondary py-4">
                    No rows for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
