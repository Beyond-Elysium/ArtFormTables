/**
 * Custom named dashboard views — pure filtering logic.
 *
 * A client can declare `views` in the registry (config/clients.ts): named tabs
 * that show only the sources they select. A view selects by source id
 * (`sourceIds`, matching an explicit registry `id` or the orchestrator's
 * positional `<type>-<index>` fallback) and/or by connector type (`types`);
 * a source matching either selector is included.
 *
 * Kept pure (no imports with side effects, no "server-only") so it runs in the
 * client-side DashboardBody and in unit tests alike.
 */
import type { ClientView } from "@/config/clients";

export type { ClientView };

/** The minimal shape a view filter needs from a source's result. */
export interface ViewSource {
  sourceId: string;
  type?: string;
}

/** True when `source` is selected by `view` (by id or by connector type). */
export function matchesView(view: ClientView, source: ViewSource): boolean {
  if (view.sourceIds?.includes(source.sourceId)) return true;
  if (source.type != null && view.types?.includes(source.type)) return true;
  return false;
}

/** The subset of `results` a view shows, in original order. */
export function filterForView<T extends ViewSource>(results: T[], view: ClientView): T[] {
  return results.filter((r) => matchesView(view, r));
}

export interface ViewGroup {
  name: string;
  views: ClientView[];
}

/**
 * Split a client's custom views into grouped buckets (views sharing a
 * `group`, e.g. several BD-vertical views grouped as "Programs") and
 * ungrouped views (each its own top-level tab, the pre-existing behavior).
 * Both groups and views-within-a-group keep their original registry order
 * (first-seen order for the group itself).
 */
export function groupViews(views: ClientView[]): { groups: ViewGroup[]; ungrouped: ClientView[] } {
  const groups: ViewGroup[] = [];
  const byName = new Map<string, ViewGroup>();
  const ungrouped: ClientView[] = [];
  for (const v of views) {
    if (!v.group) {
      ungrouped.push(v);
      continue;
    }
    let g = byName.get(v.group);
    if (!g) {
      g = { name: v.group, views: [] };
      byName.set(v.group, g);
      groups.push(g);
    }
    g.views.push(v);
  }
  return { groups, ungrouped };
}
