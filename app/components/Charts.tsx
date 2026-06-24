"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import type { NamedCount, TimeseriesPoint } from "@/lib/ga";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface Branding {
  primary: string;
  accent: string;
}

export function TrafficChart({
  data,
  brand,
}: {
  data: TimeseriesPoint[];
  brand: Branding;
}) {
  const options: ApexOptions = {
    chart: {
      type: "area",
      fontFamily: "Montserrat, sans-serif",
      toolbar: { show: false },
      animations: { enabled: true },
    },
    colors: [brand.primary, brand.accent],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
    },
    grid: { strokeDashArray: 4, borderColor: "#e6e7e9" },
    xaxis: {
      type: "datetime",
      categories: data.map((d) => d.date),
      labels: { style: { fontFamily: "Montserrat, sans-serif" } },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { fontFamily: "Montserrat, sans-serif" } } },
    legend: { fontFamily: "Fira Sans, sans-serif" },
    tooltip: { x: { format: "dd MMM" } },
  };

  const series = [
    { name: "Users", data: data.map((d) => d.users) },
    { name: "Sessions", data: data.map((d) => d.sessions) },
  ];

  return (
    <ReactApexChart
      options={options}
      series={series}
      type="area"
      height={300}
    />
  );
}

export function DonutChart({
  data,
  brand,
}: {
  data: NamedCount[];
  brand: Branding;
}) {
  const palette = [
    brand.primary,
    brand.accent,
    "#98d7eb",
    "#f15e4d",
    "#0ca678",
    "#333333",
  ];
  const options: ApexOptions = {
    chart: { type: "donut", fontFamily: "Montserrat, sans-serif" },
    labels: data.map((d) => d.name),
    colors: palette,
    legend: {
      position: "bottom",
      fontFamily: "Fira Sans, sans-serif",
    },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: "70%" } } },
  };
  return (
    <ReactApexChart
      options={options}
      series={data.map((d) => d.value)}
      type="donut"
      height={280}
    />
  );
}
