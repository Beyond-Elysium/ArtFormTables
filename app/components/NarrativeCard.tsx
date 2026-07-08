import { IconSparkles } from "@tabler/icons-react";
import type { Narrative } from "@/lib/narrative";
import type { Branding } from "@/components/Charts";

/**
 * "Smart summary" card — the auto-generated narrative of the client's metrics.
 * Rendered above the dashboard body and included in PDF reports.
 */
export function NarrativeCard({
  narrative,
  brand,
}: {
  narrative: Narrative;
  brand: Branding;
}) {
  return (
    <div className="card narrative-card mb-3" style={{ borderLeftColor: brand.primary }}>
      <div className="card-body">
        <div className="d-flex align-items-center gap-2 mb-1">
          <IconSparkles size={18} style={{ color: brand.primary }} aria-hidden="true" />
          <span className="subheader text-subtitle">Performance summary</span>
        </div>
        <p className="narrative-headline mb-2">{narrative.headline}</p>
        {narrative.items.length > 0 && (
          <ul className="narrative-items">
            {narrative.items.map((it, i) => (
              <li key={i}>
                <span className={`fw-bold ${it.positive ? "text-green" : "text-red"}`}>
                  {it.delta >= 0 ? "▲" : "▼"}
                </span>{" "}
                {it.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
