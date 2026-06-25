"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export interface Branding {
  primary: string;
  accent: string;
}

// ArtForm palette: brand blue/pink, sky, ink.
function palette(brand: Branding): string[] {
  return [brand.primary, brand.accent, "#98d7eb", "#333333"];
}

const FONT = "Montserrat, sans-serif";
const LABEL_FONT = "Fira Sans, sans-serif";

export function TimeseriesChart({
  series,
  brand,
}: {
  series: { name: string; points: { x: string; y: number }[]; dashed?: boolean }[];
  brand: Branding;
}) {
  const hasOverlay = series.some((s) => s.dashed);
  const options: ApexOptions = {
    chart: { type: "area", fontFamily: FONT, toolbar: { show: false } },
    colors: palette(brand),
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
    yaxis: { labels: { style: { fontFamily: FONT } } },
    legend: { fontFamily: LABEL_FONT },
    tooltip: { x: { format: "dd MMM" } },
  };
  const apexSeries = series.map((s) => ({
    name: s.name,
    data: s.points.map((p) => ({ x: p.x, y: p.y })),
  }));
  return <ReactApexChart options={options} series={apexSeries} type="area" height={300} />;
}

export function DonutChart({
  rows,
  brand,
}: {
  rows: { label: string; value: number }[];
  brand: Branding;
}) {
  const options: ApexOptions = {
    chart: { type: "donut", fontFamily: FONT },
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
      height={300}
    />
  );
}

export function BarChart({
  rows,
  brand,
}: {
  rows: { label: string; value: number }[];
  brand: Branding;
}) {
  const options: ApexOptions = {
    chart: { type: "bar", fontFamily: FONT, toolbar: { show: false } },
    colors: [brand.primary],
    plotOptions: { bar: { horizontal: true, borderRadius: 2, barHeight: "60%" } },
    dataLabels: { enabled: false },
    grid: { strokeDashArray: 4, borderColor: "#e6e7e9" },
    xaxis: {
      categories: rows.map((r) => r.label),
      labels: { style: { fontFamily: FONT } },
    },
    yaxis: { labels: { style: { fontFamily: FONT } } },
  };
  return (
    <ReactApexChart
      options={options}
      series={[{ name: "Value", data: rows.map((r) => r.value) }]}
      type="bar"
      height={300}
    />
  );
}
