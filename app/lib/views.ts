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
