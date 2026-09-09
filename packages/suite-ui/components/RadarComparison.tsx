"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const PALETTE = ["#E8185A", "#00B4CC", "#0D1B2A", "#F59E0B"];

export function RadarComparison({
  series,
  categories,
  height = 320,
}: {
  series: { name: string; data: number[] }[];
  categories: string[];
  height?: number;
}) {
  const options: ApexOptions = {
    chart: { type: "radar", fontFamily: "DM Sans, sans-serif", toolbar: { show: false } },
    colors: PALETTE,
    xaxis: { categories },
    legend: { position: "bottom", fontFamily: "DM Sans, sans-serif" },
    stroke: { width: 2 },
    fill: { opacity: 0.15 },
    markers: { size: 3 },
  };

  return <ReactApexChart options={options} series={series} type="radar" height={height} />;
}
