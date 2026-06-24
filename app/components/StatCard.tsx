import { formatDelta } from "@/lib/format";

export function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  const d = typeof delta === "number" ? formatDelta(delta) : null;
  return (
    <div className="col-sm-6 col-lg-3">
      <div className="card card-sm">
        <div className="card-body">
          <div className="subheader text-subtitle">{label}</div>
          <div className="d-flex align-items-baseline mt-2">
            <div className="h1 mb-0 me-2">{value}</div>
            {d && (
              <div
                className={`me-auto ${d.positive ? "text-green" : "text-red"}`}
              >
                <span className="d-inline-flex align-items-center lh-1">
                  {d.label}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
