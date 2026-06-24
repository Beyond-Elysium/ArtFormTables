import type { ConnectorResult, BreakdownPanel } from "@/lib/connectors/types";
import { formatValue } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { TimeseriesChart, DonutChart, BarChart, type Branding } from "@/components/Charts";

/**
 * Renders one connector's result generically: KPI cards, then time series and
 * breakdowns. Works for any provider because it only knows about `Panel`s.
 */
export function PanelSection({
  result,
  brand,
}: {
  result: ConnectorResult;
  brand: Branding;
}) {
  const stats = result.panels.filter((p) => p.kind === "stat");
  const rest = result.panels.filter((p) => p.kind !== "stat");

  return (
    <section className="mb-4">
      <div className="d-flex align-items-center mb-2 mt-3">
        <h2 className="page-title mb-0">{result.label}</h2>
        <span className="badge ms-2 text-uppercase" style={{ background: brand.primary }}>
          {result.category}
        </span>
        {result.isMock && (
          <span className="badge bg-orange-lt ms-2">demo data</span>
        )}
      </div>

      {result.error && (
        <div className="text-secondary small mb-2">
          Live fetch unavailable — showing sample data.
        </div>
      )}

      {stats.length > 0 && (
        <div className="row row-cards">
          {stats.map((p, i) =>
            p.kind === "stat" ? (
              <StatCard
                key={i}
                label={p.label}
                value={formatValue(p.value, p.format, p.currency)}
                delta={p.delta}
                invertDelta={p.invertDelta}
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
                  <div className="card">
                    <div className="card-header">
                      <h3 className="card-title">{p.title}</h3>
                    </div>
                    <div className="card-body">
                      <TimeseriesChart series={p.series} brand={brand} />
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div className="col-lg-4" key={i}>
                <div className="card h-100">
                  <div className="card-header">
                    <h3 className="card-title">{p.title}</h3>
                  </div>
                  {p.display === "table" ? (
                    <BreakdownTable panel={p} />
                  ) : (
                    <div className="card-body">
                      {p.display === "bar" ? (
                        <BarChart rows={p.rows} brand={brand} />
                      ) : (
                        <DonutChart rows={p.rows} brand={brand} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BreakdownTable({ panel }: { panel: BreakdownPanel }) {
  return (
    <div className="table-responsive">
      <table className="table table-vcenter card-table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="text-end">{panel.valueLabel ?? "Value"}</th>
          </tr>
        </thead>
        <tbody>
          {panel.rows.map((r, i) => (
            <tr key={i}>
              <td>
                <div className="fw-bold text-truncate" style={{ maxWidth: 220 }}>
                  {r.label}
                </div>
                {r.sublabel && (
                  <div className="text-secondary small text-truncate" style={{ maxWidth: 220 }}>
                    {r.sublabel}
                  </div>
                )}
              </td>
              <td className="text-end">
                {formatValue(r.value, panel.valueFormat ?? "number")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
