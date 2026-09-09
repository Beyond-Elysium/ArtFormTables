"use client";

import { useEffect, useRef, useState } from "react";
import "jsvectormap/dist/jsvectormap.css";
import type { MapPanel } from "@/lib/connectors/types";
import { formatValue } from "@/lib/format";
import type { Branding } from "@/components/Charts";
import {
  MAP_EMPTY_FILL,
  MAP_STEPS,
  bucketRanges,
  bucketRegions,
  rampScale,
  sequentialRamp,
} from "@/components/mapScale";

const MAP_HEIGHT = 300;

/** jsvectormap has no bundled types; this is the slice of its API we use. */
interface VectorMapInstance {
  destroy?: (destroyInstance?: boolean) => void;
}
interface VectorMapTooltip {
  text: (s?: string, html?: boolean) => string | void;
}

/**
 * Choropleth map panel, drawn with jsvectormap (already a dependency of the
 * ArtForm-branded @tabler/core, and the design system ships styling for its
 * `.jvm-*` classes).
 *
 * Two things about the library shape the code below:
 *
 *  1. **No continuous color scale.** Its `OrdinalScale.getValue` is a plain
 *     `scale[value]` lookup, so `values` maps a region code to a *step name*
 *     (`step3`), not a number. Bucketing lives in mapScale.ts.
 *  2. **Map data files are not modules.** `dist/maps/world.js` is a bare script
 *     that calls a *global* `jsVectorMap.addMap(...)`, so the constructor has
 *     to be on `window` before that import runs, or it throws. The US map is
 *     vendored as plain JSON (see maps/README.md) and registered directly, so
 *     it needs no such dance.
 *
 * Everything is loaded inside the effect: jsvectormap touches `document` at
 * import time, and the map payloads are ~100 KB each, so neither belongs in
 * the server bundle or the initial client chunk.
 */
export function MapChart({ panel, brand }: { panel: MapPanel; brand: Branding }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const ramp = sequentialRamp(brand, MAP_STEPS);

  useEffect(() => {
    let instance: VectorMapInstance | null = null;
    // The mount can be torn down (tab switch) before these dynamic imports
    // resolve; without this guard we'd construct a map into a detached node
    // and leak it — the same unmount race that bites the chart wrappers.
    let cancelled = false;

    (async () => {
      try {
        const el = containerRef.current;
        if (!el) return;

        const { default: jsVectorMap } = await import("jsvectormap");
        if (cancelled) return;

        let mapName: string;
        if (panel.scope === "us") {
          mapName = "us_mill";
          const { default: usMap } = await import("@/components/maps/us-mill.json");
          if (cancelled) return;
          (jsVectorMap as unknown as { addMap: (n: string, m: unknown) => void }).addMap(
            mapName,
            usMap,
          );
        } else {
          mapName = "world";
          // See note 2 above — the map script needs the global to exist first.
          (window as unknown as { jsVectorMap?: unknown }).jsVectorMap = jsVectorMap;
          await import("jsvectormap/dist/maps/world.js");
          if (cancelled) return;
        }

        const values = bucketRegions(panel.rows, MAP_STEPS);
        const byCode = new Map(panel.rows.map((r) => [r.code, r]));

        const Ctor = jsVectorMap as unknown as new (opts: Record<string, unknown>) => VectorMapInstance;
        instance = new Ctor({
          selector: el,
          map: mapName,
          backgroundColor: "transparent",
          zoomOnScroll: false,
          zoomButtons: false,
          regionStyle: {
            initial: { fill: MAP_EMPTY_FILL, stroke: "#ffffff", strokeWidth: 0.5 },
            hover: { fillOpacity: 0.85 },
          },
          series: {
            regions: [{ attribute: "fill", scale: rampScale(ramp), values }],
          },
          onRegionTooltipShow(
            _event: Event,
            tooltip: VectorMapTooltip,
            code: string,
          ) {
            const row = byCode.get(code);
            // Regions with no data keep jsvectormap's own label; ours adds the
            // measure, so a hover always answers "how much?" when we know.
            if (!row) return;
            const value = formatValue(row.value, panel.valueFormat ?? "number");
            tooltip.text(`${row.label}: ${value}`);
          },
        });
      } catch (err) {
        console.error("[map] failed to render", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      try {
        instance?.destroy?.();
      } catch {
        // Map never finished mounting — nothing to tear down.
      }
    };
  }, [panel, brand, ramp]);

  if (failed || panel.rows.length === 0) {
    return (
      <div
        className="d-flex align-items-center justify-content-center text-secondary small"
        style={{ height: MAP_HEIGHT }}
      >
        {failed ? "Map unavailable" : "No location data for this period"}
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="map-canvas" style={{ height: MAP_HEIGHT }} />
      <MapLegend panel={panel} ramp={ramp} />
    </>
  );
}

/**
 * Ordinal legend: the ramp is bucketed, so the reader needs the bucket
 * boundaries to decode a shade. Values are the upper bound of each step.
 */
function MapLegend({ panel, ramp }: { panel: MapPanel; ramp: string[] }) {
  const ranges = bucketRanges(panel.rows, ramp.length);
  const fmt = (v: number) => formatValue(Math.round(v), panel.valueFormat ?? "number");
  return (
    <div className="map-legend d-print-none" aria-hidden="true">
      <span className="text-secondary small">{panel.valueLabel ?? "Value"}</span>
      <span className="map-legend-scale">
        {ramp.map((color, i) => (
          <span
            key={color}
            className="map-legend-step"
            style={{ background: color }}
            title={`up to ${fmt(ranges[i])}`}
          />
        ))}
      </span>
      <span className="text-secondary small">{fmt(ranges[ranges.length - 1] ?? 0)}</span>
    </div>
  );
}
