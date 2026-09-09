/**
 * Minimal ambient types for jsvectormap (the package ships none).
 *
 * Only the slice `components/MapChart.tsx` uses is declared — the constructor,
 * the static `addMap` used to register the vendored US map, and the map data
 * files, which are side-effect scripts rather than modules (see MapChart's
 * header comment for why that matters).
 */
declare module "jsvectormap" {
  interface JsVectorMapTooltip {
    text(text?: string, html?: boolean): string | void;
  }

  interface JsVectorMapOptions {
    selector: string | HTMLElement;
    map: string;
    backgroundColor?: string;
    zoomOnScroll?: boolean;
    zoomButtons?: boolean;
    regionStyle?: Record<string, unknown>;
    series?: {
      regions?: Array<{
        attribute?: string;
        /** Ordinal only — a step-name → color map. jsvectormap 1.x has no
         *  continuous scale (its OrdinalScale.getValue is `scale[value]`). */
        scale?: Record<string, string>;
        /** Region code → step name (matching a `scale` key). */
        values?: Record<string, string | number>;
      }>;
    };
    onRegionTooltipShow?(event: Event, tooltip: JsVectorMapTooltip, code: string): void;
    [option: string]: unknown;
  }

  class JsVectorMap {
    constructor(options: JsVectorMapOptions);
    destroy(destroyInstance?: boolean): void;
    static addMap(name: string, map: unknown): void;
  }

  export default JsVectorMap;
}

/** Map data files register themselves via a global; imported for side effects. */
declare module "jsvectormap/dist/maps/world.js";
declare module "jsvectormap/dist/maps/world-merc.js";
