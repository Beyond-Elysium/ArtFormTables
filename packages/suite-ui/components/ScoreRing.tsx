export const SCORE_BANDS = [
  { min: 0, max: 30, color: "#94A3B8", label: "Critical" },
  { min: 31, max: 55, color: "#F59E0B", label: "Needs work" },
  { min: 56, max: 75, color: "#00B4CC", label: "Good" },
  { min: 76, max: 100, color: "#16A34A", label: "Excellent" },
] as const;

function bandFor(value: number) {
  const clamped = Math.max(0, Math.min(100, value));
  return SCORE_BANDS.find((b) => clamped >= b.min && clamped <= b.max) ?? SCORE_BANDS[0];
}

const SIZE = 120;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const band = bandFor(clamped);
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className="d-inline-flex flex-column align-items-center" style={{ width: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${label ?? "Score"}: ${clamped} of 100`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--tblr-border-color, #e6e7e9)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={band.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fontSize="28"
          fontWeight={700}
          fill="var(--as-slate, #1e293b)"
        >
          {Math.round(clamped)}
        </text>
      </svg>
      {label && <div className="text-secondary small mt-1 text-center">{label}</div>}
    </div>
  );
}
