/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint toolchain isn't wired up for this package yet; type-checking still runs.
  eslint: { ignoreDuringBuilds: true },
  // @tabler/core ships compiled CSS we import directly; nothing to transpile.
  experimental: {
    // Server-only packages that must never be bundled (native/dynamic requires).
    serverComponentsExternalPackages: ["@google-analytics/data", "playwright-core"],
  },
};

export default nextConfig;
