"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorResult } from "@/lib/connectors/types";
import type { Branding } from "@/components/Charts";
import { PanelSection } from "@/components/PanelSection";

const OVERVIEW = "Overview";

const slugifyTab = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Renders a client's sources with view tabs. "Overview" shows everything; each
 * additional tab is a data category (Analytics, Advertising, Payments, …),
 * derived automatically from the sources. Switching views is instant — no
 * refetch — because all data is already on the page.
 *
 * The active view is mirrored to the URL hash so it survives a range/compare
 * change (which remounts this component) and stays shareable.
 */
export function DashboardBody({
  results,
  brand,
  deltaSuffix,
  showAll = false,
}: {
  results: ConnectorResult[];
  brand: Branding;
  deltaSuffix?: string;
  /** Render every source and hide the view tabs (used for PDF reports). */
  showAll?: boolean;
}) {
  // Categories in first-seen order.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const r of results) if (!seen.includes(r.category)) seen.push(r.category);
    return seen;
  }, [results]);

  const tabs = useMemo(
    () => (categories.length > 1 ? [OVERVIEW, ...categories] : [OVERVIEW]),
    [categories],
  );

  const [active, setActive] = useState(OVERVIEW);

  // Restore the active view from the URL hash after mount (SSR-safe).
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    if (!h) return;
    const match = tabs.find((t) => slugifyTab(t) === h);
    if (match) setActive(match);
  }, [tabs]);

  const current = tabs.includes(active) ? active : OVERVIEW;

  function select(t: string) {
    setActive(t);
    const hash = t === OVERVIEW ? " " : slugifyTab(t);
    // replaceState keeps it out of history and avoids a scroll jump.
    window.history.replaceState(null, "", t === OVERVIEW ? window.location.pathname + window.location.search : `#${hash}`);
  }

  const visible =
    showAll || current === OVERVIEW
      ? results
      : results.filter((r) => r.category === current);

  // WAI-ARIA tabs pattern: ArrowLeft/ArrowRight (plus Home/End) move both
  // focus and selection; inactive tabs sit outside the tab order (roving
  // tabindex), so Tab lands on the active tab only.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(tabs[next]);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      {tabs.length > 1 && !showAll && (
        <ul className="nav nav-tabs view-tabs mb-3 d-print-none" role="tablist">
          {tabs.map((t, i) => (
            <li className="nav-item" key={t} role="presentation">
              <button
                type="button"
                className={`nav-link ${t === current ? "active" : ""}`}
                onClick={() => select(t)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                aria-selected={t === current}
                tabIndex={t === current ? 0 : -1}
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

      {visible.length > 0 ? (
        visible.map((result) => (
          <PanelSection
            key={result.sourceId}
            result={result}
            brand={brand}
            deltaSuffix={deltaSuffix}
          />
        ))
      ) : (
        <div className="empty">
          <p className="empty-title">No data sources in this view</p>
          <p className="empty-subtitle text-secondary">
            Data sources for this view are still being set up.
          </p>
        </div>
      )}
    </>
  );
}
