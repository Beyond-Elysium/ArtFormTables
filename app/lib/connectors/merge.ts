/**
 * Comparison-window merging.
 *
 * Panel lists are conditional: GA4's AI block returns `[]` on error, Search
 * Console appends sitemap-health panels only when the sitemaps call succeeds,
 * Bing appends SEO panels only when its crawl/link endpoints respond. So the
 * primary and comparison windows can produce different panel counts for the
 * same source, and a positional merge would pair the wrong panels (wrong
 * compareValues on live dashboards).
 *
 * Matching is therefore key-based, within the same source result: stats match
 * by `label`, timeseries and breakdowns by `title`. Unmatched panels pass
 * through unchanged. (Result lists themselves still align positionally — both
 * windows fetch the same `client.sources` in the same order.)
 */
import "server-only";
import type { ConnectorResult, Panel } from "./types";
import { pct } from "./util";

/** Identity of a panel within one source result. */
function panelKey(p: Panel): string {
  return p.kind === "stat" ? `stat:${p.label}` : `${p.kind}:${p.title}`;
}

/**
 * Merge comparison-window results into the primary results: stats gain a
 * `compareValue` + recomputed delta, timeseries gain a dashed "(prev)" overlay
 * aligned on the primary axis.
 */
export function mergeResults(
  primary: ConnectorResult[],
  comparison: ConnectorResult[],
  axis: string[],
): ConnectorResult[] {
  return primary.map((result, ri) => {
    const comp = comparison[ri];
    if (!comp) return result;

    // Key → comparison panel. First occurrence wins on duplicate keys, and a
    // match is consumed so two primary panels never merge the same partner.
    const byKey = new Map<string, Panel>();
    for (const p of comp.panels) {
      const key = panelKey(p);
      if (!byKey.has(key)) byKey.set(key, p);
    }

    return {
      ...result,
      panels: result.panels.map((panel) => {
        const key = panelKey(panel);
        const match = byKey.get(key);
        if (match) byKey.delete(key);
        return mergePanel(panel, match, axis);
      }),
    };
  });
}

/** Merge a comparison panel into a primary panel of the same shape. */
export function mergePanel(primary: Panel, comp: Panel | undefined, axis: string[]): Panel {
  if (!comp || comp.kind !== primary.kind) return primary;

  if (primary.kind === "stat" && comp.kind === "stat") {
    return {
      ...primary,
      compareValue: comp.value,
      delta: pct(primary.value, comp.value),
    };
  }

  if (primary.kind === "timeseries" && comp.kind === "timeseries") {
    // Overlay each comparison line as dashed, aligned on the primary axis.
    const overlay = comp.series.map((s) => ({
      name: `${s.name} (prev)`,
      dashed: true,
      points: s.points.map((pt, i) => ({ x: axis[i] ?? pt.x, y: pt.y })),
    }));
    return { ...primary, series: [...primary.series, ...overlay] };
  }

  return primary;
}
