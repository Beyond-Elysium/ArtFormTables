"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { formatCompact } from "@/lib/format";
import { chartPalette, clampLabel, seriesColors } from "@/components/chartPalette";

const CHART_HEIGHT = 300;

// Reserve the chart's height while the (client-only) bundle loads to avoid
// layout shift, and show a subtle skeleton.
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="chart-skeleton" style={{ height: CHART_HEIGHT }} />,
});

export interface Branding {
  primary: string;
  accent: string;
}

// ArtForm palette: brand blue/pink/sky/ink + 4 derived tints/shades (8 total,
// so a 6-slice donut never cycles). Derivation lives in chartPalette.ts.
function palette(brand: Branding): string[] {
  return chartPalette(brand);
}

const FONT = "Montserrat, sans-serif";
const LABEL_FONT = "Fira Sans, sans-serif";
const compactAxis = (v: number) => formatCompact(v);

/**
 * True when the user prefers reduced motion. ApexCharts animates via JS, so
 * the CSS media query alone can't stop it — this hook feeds
 * `chart.animations.enabled` instead. SSR-safe (defaults to false, resolves
 * after mount) and live (tracks OS-setting changes).
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function TimeseriesChart({
  series,
  brand,
}: {
  series: { name: string; points: { x: string; y: number }[]; dashed?: boolean }[];
  brand: Branding;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const hasOverlay = series.some((s) => s.dashed);
  const options: ApexOptions = {
    chart: {
      type: "area",
      fontFamily: FONT,
      toolbar: { show: false },
      animations: { enabled: !reducedMotion },
    },
    // Dashed "(prev)" overlays reuse their primary series' color (muted), so
    // each comparison line visually pairs with its solid line.
    colors: seriesColors(series, palette(brand)),
    dataLabels: { enabled: false },
    stroke: {
      curve: "smooth",
      width: series.map((s) => (s.dashed ? 2 : 2.5)),
      // Dashed overlay for comparison ("previous") lines.
      dashArray: series.map((s) => (s.dashed ? 5 : 0)),
    },
    fill: {
      type: hasOverlay ? "solid" : "gradient",
      opacity: hasOverlay ? series.map((s) => (s.dashed ? 0 : 0.12)) : undefined,
      gradient: { opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
    },
    grid: { strokeDashArray: 4, borderColor: "#e6e7e9" },
    xaxis: {
      type: "datetime",
      labels: { style: { fontFamily: FONT } },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { fontFamily: FONT }, formatter: compactAxis } },
    legend: { fontFamily: LABEL_FONT },
    tooltip: { x: { format: "dd MMM" } },
  };
  const apexSeries = series.map((s) => ({
    name: s.name,
    data: s.points.map((p) => ({ x: p.x, y: p.y })),
  }));
  return (
    <ReactApexChart options={options} series={apexSeries} type="area" height={CHART_HEIGHT} />
  );
}

export function DonutChart({
  rows,
  brand,
}: {
  rows: { label: string; value: number }[];
  brand: Branding;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const options: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: FONT,
      animations: { enabled: !reducedMotion },
    },
    labels: rows.map((r) => r.label),
    colors: palette(brand),
    legend: { position: "bottom", fontFamily: LABEL_FONT },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: "70%" } } },
  };
  return (
    <ReactApexChart
      options={options}
      series={rows.map((r) => r.value)}
      type="donut"
      height={CHART_HEIGHT}
    />
  );
}

export function BarChart({
  rows,
  brand,
  onSelect,
}: {
  rows: { label: string; value: number }[];
  brand: Branding;
  /** Cross-filter hook: fires with the clicked bar's category label. */
  onSelect?: (label: string) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const options: ApexOptions = {
    chart: {
      type: "bar",
      fontFamily: FONT,
      toolbar: { show: false },
      animations: { enabled: !reducedMotion },
      events: onSelect
        ? {
            dataPointSelection: (_e, _ctx, cfg) => {
              const label = rows[cfg.dataPointIndex]?.label;
              if (label !== undefined) onSelect(String(label));
            },
          }
        : undefined,
    },
    states: onSelect ? { active: { filter: { type: "none" } } } : undefined,
    colors: [brand.primary],
    plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: "60%" } },
    dataLabels: { enabled: false },
    grid: { strokeDashArray: 4, borderColor: "#e6e7e9" },
    xaxis: {
      categories: rows.map((r) => r.label),
      labels: { style: { fontFamily: FONT } },
    },
    yaxis: {
      labels: {
        style: { fontFamily: FONT },
        // Horizontal bars put categories on the y-axis: clamp long labels
        // (page paths, campaign names); the tooltip shows the full text.
        formatter: (val) => clampLabel(String(val)),
      },
    },
    tooltip: {
      x: {
        formatter: (_val, opts?: { dataPointIndex?: number }) => {
          const i = opts?.dataPointIndex;
          return (i != null && rows[i]?.label) || String(_val);
        },
      },
    },
  };
  return (
    <ReactApexChart
      options={options}
      series={[{ name: "Value", data: rows.map((r) => r.value) }]}
      type="bar"
      height={CHART_HEIGHT}
    />
  );
}
