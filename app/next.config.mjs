import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint toolchain isn't wired up for this package yet; type-checking still runs.
  eslint: { ignoreDuringBuilds: true },

  // Dashboards are unlisted-URL public: never indexable, and sensible security
  // headers everywhere. The PDF renderer (headless Chromium loading ?print=1
  // pages same-origin, top-level) is unaffected by any of these — X-Frame-Options
  // only restricts framing, and robots headers don't apply to direct loads.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },

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
    // these into the report functions' bundles. Point at the *real* .pnpm path
    // (not the app/node_modules symlink) so Vercel can package the files —
    // tracing through the symlink yields an invalid serverless function.
    outputFileTracingIncludes: {
      "/api/report/[client]": [
        "../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
      ],
      "/api/cron/reports": [
        "../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
      ],
    },
  },
};

export default nextConfig;
