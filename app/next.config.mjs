import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint toolchain isn't wired up for this package yet; type-checking still runs.
  eslint: { ignoreDuringBuilds: true },

  experimental: {
    // Server-only packages that must never be bundled (native/dynamic requires).
    serverComponentsExternalPackages: [
      "@google-analytics/data",
      "playwright-core",
      "@sparticuz/chromium",
    ],

    // pnpm hoists deps to the monorepo root; point file tracing there so it can
    // reach the .pnpm store.
    outputFileTracingRoot: path.join(__dirname, ".."),

    // @sparticuz/chromium ships its browser as bin/*.br data files that are read
    // from disk at runtime — Next's tracer only follows `require`d JS, so force
    // these into the report functions' bundles (covers the symlink and the real
    // .pnpm path).
    outputFileTracingIncludes: {
      "/api/report/[client]": [
        "./node_modules/@sparticuz/chromium/bin/**",
        "../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
      ],
      "/api/cron/reports": [
        "./node_modules/@sparticuz/chromium/bin/**",
        "../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
      ],
    },
  },
};

export default nextConfig;
