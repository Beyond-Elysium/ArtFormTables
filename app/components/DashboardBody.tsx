"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorResult } from "@/lib/connectors/types";
import type { Branding } from "@/components/Charts";
import { filterForView, groupViews, type ClientView } from "@/lib/views";
import { PanelSection } from "@/components/PanelSection";

const OVERVIEW = "Overview";

const slugifyTab = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** One item in the top-level nav row: a plain tab, or a group's dropdown trigger. */
type NavStop = { kind: "tab"; name: string } | { kind: "group"; group: string; children: string[] };

/**
 * Renders a client's sources with view tabs. "Overview" shows everything;
 * any custom named views from the client registry come next (e.g. BBBNP's
 * "CISR/IRI"), followed by the data categories (Analytics, Advertising,
 * Payments, …) derived automatically from the sources. Switching views is
 * instant — no refetch — because all data is already on the page.
 *
 * Views sharing a registry `group` (e.g. several BD-vertical views grouped
 * as "Programs") collapse into a single dropdown tab instead of crowding the
 * row with N separate tabs — see lib/views.ts's `groupViews`.
 *
 * The active view is mirrored to the URL hash so it survives a range/compare
 * change (which remounts this component) and stays shareable.
 */
export function DashboardBody({
  results,
  brand,
  deltaSuffix,
  windowLabel,
  views,
  showAll = false,
}: {
  results: ConnectorResult[];
  brand: Branding;
  deltaSuffix?: string;
  /** Human label for the active date window (used in CSV export filenames). */
  windowLabel?: string;
  /** Custom named views from the client registry (rendered before categories). */
  views?: ClientView[];
  /** Render every source and hide the view tabs (used for PDF reports). */
  showAll?: boolean;
}) {
  const customViews = useMemo(() => views ?? [], [views]);
  const { groups, ungrouped } = useMemo(() => groupViews(customViews), [customViews]);

  // Categories in first-seen order. A custom view with the same name as a
  // category takes the tab; drop the colliding category to avoid duplicates.
  const categories = useMemo(() => {
    const viewNames = new Set(customViews.map((v) => v.name));
    const seen: string[] = [];
    for (const r of results)
      if (!seen.includes(r.category) && !viewNames.has(r.category)) seen.push(r.category);
    return seen;
  }, [results, customViews]);

  // The full set of selectable content names (what a tab/menu item can show),
  // independent of how they're grouped for display. Drives hash-restore and
  // resultsForTab, same semantics as before grouping existed.
  const contentNames = useMemo(
    () => [OVERVIEW, ...customViews.map((v) => v.name), ...categories],
    [customViews, categories],
  );

  // The rendered top-level nav row: Overview, one stop per group, ungrouped
  // views, then categories — same overall ordering as the pre-grouping tab
  // list, just with grouped views collapsed into one stop each.
  const navStops = useMemo<NavStop[]>(
    () => [
      { kind: "tab", name: OVERVIEW },
      ...groups.map((g) => ({ kind: "group" as const, group: g.name, children: g.views.map((v) => v.name) })),
      ...ungrouped.map((v) => ({ kind: "tab" as const, name: v.name })),
      ...categories.map((c) => ({ kind: "tab" as const, name: c })),
    ],
    [groups, ungrouped, categories],
  );

  const [active, setActive] = useState(OVERVIEW);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Restore the active view from the URL hash after mount (SSR-safe).
  useEffect(() => {
    let h = "";
    try {
      h = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (!h) return;
    const match = contentNames.find((t) => slugifyTab(t) === h);
    if (match) setActive(match);
  }, [contentNames]);

  const current = contentNames.includes(active) ? active : OVERVIEW;

  function select(t: string) {
    setActive(t);
    setOpenGroup(null);
    const hash = t === OVERVIEW ? " " : slugifyTab(t);
    // replaceState keeps it out of history and avoids a scroll jump.
    window.history.replaceState(null, "", t === OVERVIEW ? window.location.pathname + window.location.search : `#${hash}`);
  }

  // What one tab shows: everything (Overview), a custom view's selection, or a
  // category's sources.
  function resultsForTab(t: string): ConnectorResult[] {
    if (t === OVERVIEW) return results;
    const view = customViews.find((v) => v.name === t);
    if (view) return filterForView(results, view);
    return results.filter((r) => r.category === t);
  }

  const visible = showAll ? results : resultsForTab(current);

  const groupBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function openGroupMenu(group: string) {
    const el = groupBtnRefs.current[group];
    if (el) {
      const rect = el.getBoundingClientRect();
      setMenuPos({ top: rect.bottom, left: rect.left });
    }
    setOpenGroup(group);
  }
  function closeGroupMenu(refocusTrigger = false) {
    const g = openGroup;
    setOpenGroup(null);
    if (refocusTrigger && g) groupBtnRefs.current[g]?.focus();
  }

  // Close the open menu on Escape, and on scroll/resize (its position would
  // otherwise go stale — it's positioned via a snapshot rect, not tracked).
  useEffect(() => {
    if (!openGroup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGroupMenu(true);
    };
    const onDismiss = () => closeGroupMenu(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGroup]);

  // WAI-ARIA tabs pattern: ArrowLeft/ArrowRight (plus Home/End) move both
  // focus and selection across top-level stops; inactive tabs sit outside the
  // tab order (roving tabindex), so Tab lands on the active tab only. A group
  // stop is a menu-button: ArrowDown/Enter/Space open its menu instead of
  // selecting directly (selection happens on a child).
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function onStopKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    const stop = navStops[idx];
    if (stop.kind === "group" && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openGroupMenu(stop.group);
      requestAnimationFrame(() => menuItemRefs.current[0]?.focus());
      return;
    }
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % navStops.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + navStops.length) % navStops.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = navStops.length - 1;
    if (next === null) return;
    e.preventDefault();
    setOpenGroup(null);
    const target = navStops[next];
    if (target.kind === "tab") select(target.name);
    tabRefs.current[next]?.focus();
  }

  function onMenuItemKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, group: string, idx: number, count: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      menuItemRefs.current[(idx + 1) % count]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      menuItemRefs.current[(idx - 1 + count) % count]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeGroupMenu(true);
    }
    void group;
  }

  return (
    <>
      {navStops.length > 1 && !showAll && (
        <ul className="nav nav-tabs view-tabs mb-3 d-print-none" role="tablist">
          {navStops.map((stop, i) => {
            if (stop.kind === "tab") {
              const t = stop.name;
              return (
                <li className="nav-item" key={t} role="presentation">
                  <button
                    type="button"
                    className={`nav-link ${t === current ? "active" : ""}`}
                    onClick={() => select(t)}
                    onKeyDown={(e) => onStopKeyDown(e, i)}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    role="tab"
                    aria-selected={t === current}
                    tabIndex={t === current ? 0 : -1}
                  >
                    {t}
                    <span className="badge bg-secondary-lt ms-2">{resultsForTab(t).length}</span>
                  </button>
                </li>
              );
            }

            const isGroupActive = stop.children.includes(current);
            const isOpen = openGroup === stop.group;
            return (
              <li className="nav-item view-group" key={stop.group} role="presentation">
                <button
                  type="button"
                  className={`nav-link ${isGroupActive ? "active" : ""}`}
                  onClick={() => (isOpen ? closeGroupMenu(false) : openGroupMenu(stop.group))}
                  onKeyDown={(e) => onStopKeyDown(e, i)}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                    groupBtnRefs.current[stop.group] = el;
                  }}
                  role="tab"
                  aria-selected={isGroupActive}
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                  tabIndex={isGroupActive ? 0 : -1}
                >
                  {isGroupActive ? `${stop.group} · ${current}` : stop.group}
                  <span className="dropdown-caret ms-1" aria-hidden="true">
                    ▾
                  </span>
                  {isGroupActive && (
                    <span className="badge bg-secondary-lt ms-2">{resultsForTab(current).length}</span>
                  )}
                </button>

                {isOpen && menuPos && (
                  <>
                    <div className="click-backdrop" onClick={() => closeGroupMenu(false)} />
                    <div
                      className="card view-group-menu"
                      role="menu"
                      aria-label={stop.group}
                      style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
                    >
                      {stop.children.map((childName, ci) => (
                        <button
                          type="button"
                          key={childName}
                          role="menuitem"
                          className={`dropdown-item ${childName === current ? "active" : ""}`}
                          onClick={() => select(childName)}
                          onKeyDown={(e) => onMenuItemKeyDown(e, stop.group, ci, stop.children.length)}
                          ref={(el) => {
                            menuItemRefs.current[ci] = el;
                          }}
                        >
                          {childName}
                          <span className="badge bg-secondary-lt ms-2">{resultsForTab(childName).length}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {visible.length > 0 ? (
        visible.map((result) => (
          <PanelSection
            key={result.sourceId}
            result={result}
            brand={brand}
            deltaSuffix={deltaSuffix}
            windowLabel={windowLabel}
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
