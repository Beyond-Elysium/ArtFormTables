import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint toolchain isn't wired up for this package yet; type-checking still runs.
  eslint: { ignoreDuringBuilds: true },

  // @artform/suite-ui ships TS/TSX source (no build step yet) — let Next
  // transpile it directly rather than requiring a prebuilt dist.
  transpilePackages: ["@artform/suite-ui"],

  experimental: {
    // pnpm hoists deps to the monorepo root; point file tracing there so it can
    // reach the .pnpm store.
    outputFileTracingRoot: path.join(__dirname, ".."),
  },
};

export default nextConfig;
