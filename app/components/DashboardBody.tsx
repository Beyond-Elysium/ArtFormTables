"use client";

import { useMemo, useState } from "react";
import type { ConnectorResult } from "@/lib/connectors/types";
import type { Branding } from "@/components/Charts";
import { PanelSection } from "@/components/PanelSection";

const OVERVIEW = "Overview";

/**
 * Renders a client's sources with view tabs. "Overview" shows everything; each
 * additional tab is a data category (Analytics, Advertising, Payments, …),
 * derived automatically from the sources. Switching views is instant — no
 * refetch — because all data is already on the page.
 */
export function DashboardBody({
  results,
  brand,
  deltaSuffix,
}: {
  results: ConnectorResult[];
  brand: Branding;
  deltaSuffix?: string;
}) {
  // Categories in first-seen order.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const r of results) if (!seen.includes(r.category)) seen.push(r.category);
    return seen;
  }, [results]);

  const tabs = categories.length > 1 ? [OVERVIEW, ...categories] : [OVERVIEW];
  const [active, setActive] = useState(OVERVIEW);
  const current = tabs.includes(active) ? active : OVERVIEW;

  const visible =
    current === OVERVIEW ? results : results.filter((r) => r.category === current);

  return (
    <>
      {tabs.length > 1 && (
        <ul className="nav nav-tabs view-tabs mb-3 d-print-none" role="tablist">
          {tabs.map((t) => (
            <li className="nav-item" key={t} role="presentation">
              <button
                type="button"
                className={`nav-link ${t === current ? "active" : ""}`}
                onClick={() => setActive(t)}
                role="tab"
                aria-selected={t === current}
              >
                {t}
                <span className="badge bg-secondary-lt ms-2">
                  {t === OVERVIEW
                    ? results.length
                    : results.filter((r) => r.category === t).length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {visible.map((result) => (
        <PanelSection
          key={result.sourceId}
          result={result}
          brand={brand}
          deltaSuffix={deltaSuffix}
        />
      ))}
    </>
  );
}
