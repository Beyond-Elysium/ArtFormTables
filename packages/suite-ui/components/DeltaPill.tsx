export function DeltaPill({ value, positive, suffix }: { value: number; positive: boolean; suffix?: string }) {
  const isUp = value >= 0;
  const sign = isUp ? "+" : "";
  const badgeClass = positive ? "text-green bg-green-lt" : "text-red bg-red-lt";

  return (
    <span className={`badge ${badgeClass} d-inline-flex align-items-center gap-1`}>
      <span aria-hidden="true">{isUp ? "▲" : "▼"}</span>
      {sign}
      {value.toFixed(1)}%{suffix ? ` ${suffix}` : ""}
    </span>
  );
}
