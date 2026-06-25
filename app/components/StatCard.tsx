import { formatDelta } from "@/lib/format";

export function StatCard({
  label,
  value,
  delta,
  invertDelta = false,
  compareValue,
}: {
  label: string;
  value: string;
  delta?: number;
  /** When true, an increase is shown as negative (e.g. cost, avg position). */
  invertDelta?: boolean;
  /** Formatted comparison-period value, shown beneath when comparing. */
  compareValue?: string;
}) {
  const d = typeof delta === "number" ? formatDelta(delta) : null;
  const good = d ? (invertDelta ? !d.positive : d.positive) : false;
  return (
    <div className="col-sm-6 col-lg-3">
      <div className="card card-sm h-100">
        <div className="card-body">
          <div className="subheader text-subtitle">{label}</div>
          <div className="d-flex align-items-baseline mt-2">
            <div className="h1 mb-0 me-2">{value}</div>
            {d && (
              <div className={`me-auto fw-bold ${good ? "text-green" : "text-red"}`}>
                <span className="d-inline-flex align-items-center lh-1">
                  {d.positive ? "▲" : "▼"} {d.label}
                </span>
              </div>
            )}
          </div>
          {compareValue && (
            <div className="text-secondary small mt-1">vs {compareValue} prior</div>
          )}
        </div>
      </div>
    </div>
  );
}
