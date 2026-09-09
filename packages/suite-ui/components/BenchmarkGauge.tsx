export function BenchmarkGauge({
  value,
  min,
  max,
  p25,
  p50,
  p75,
  label,
}: {
  value: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  label?: string;
}) {
  const span = max - min || 1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / span) * 100))}%`;

  const valueColor = value < p25 ? "#DC2626" : value < p50 ? "#F59E0B" : "#16A34A";

  return (
    <div>
      {label && <div className="text-secondary small mb-1">{label}</div>}
      <div style={{ position: "relative", height: 10, background: "var(--tblr-border-color, #e6e7e9)", borderRadius: "var(--tblr-border-radius-pill, 999px)" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: pct(Math.max(min, Math.min(max, value))),
            background: valueColor,
            borderRadius: "var(--tblr-border-radius-pill, 999px)",
          }}
        />
        {[
          { at: p25, name: "p25" },
          { at: p50, name: "p50" },
          { at: p75, name: "p75" },
        ].map((marker) => (
          <div
            key={marker.name}
            title={`${marker.name}: ${marker.at}`}
            style={{
              position: "absolute",
              left: pct(marker.at),
              top: -3,
              bottom: -3,
              width: 2,
              background: "var(--as-navy, #0d1b2a)",
            }}
          />
        ))}
      </div>
      <div className="d-flex justify-content-between text-secondary small mt-1">
        <span>{min}</span>
        <span className="fw-bold" style={{ color: valueColor }}>
          {value}
        </span>
        <span>{max}</span>
      </div>
    </div>
  );
}
