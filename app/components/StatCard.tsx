import { formatDelta } from "@/lib/format";
import { StatIcon } from "@/components/Icons";

/**
 * KPI card: colored left accent, label + icon, big value, and a delta with the
 * comparison context ("vs prior 30d") — or a muted caption when there's no
 * delta (e.g. averages).
 */
export function StatCard({
  label,
  value,
  delta,
  invertDelta = false,
  compareValue,
  caption,
  accentColor,
  deltaSuffix,
}: {
  label: string;
  value: string;
  delta?: number;
  invertDelta?: boolean;
  /** Formatted comparison-period value, shown when comparing. */
  compareValue?: string;
  /** Shown instead of a delta when no delta is available. */
  caption?: string;
  /** Left-border + icon accent color. */
  accentColor: string;
  /** Trailing context for the delta, e.g. "vs prior 30d". */
  deltaSuffix?: string;
}) {
  const d = typeof delta === "number" ? formatDelta(delta) : null;
  const good = d ? (invertDelta ? !d.positive : d.positive) : false;
  return (
    <div className="stat-card-wrap">
      <div className="card stat-card h-100" style={{ borderLeftColor: accentColor }}>
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between">
            <div className="subheader text-subtitle">{label}</div>
            <span className="stat-icon" style={{ color: accentColor }} aria-hidden="true">
              <StatIcon label={label} />
            </span>
          </div>
          <div className="stat-value mt-2 mb-1">{value}</div>
          {d ? (
            <div className="small">
              <span className={`fw-bold ${good ? "text-green" : "text-red"}`}>
                {d.positive ? "▲" : "▼"} {d.label}
              </span>
              {deltaSuffix && <span className="text-secondary ms-1">{deltaSuffix}</span>}
            </div>
          ) : (
            <div className="small text-secondary">{caption ?? "Avg over period"}</div>
          )}
          {compareValue && (
            <div className="text-secondary small mt-1">vs {compareValue} prior</div>
          )}
        </div>
      </div>
    </div>
  );
}
