function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  const withProtocol =
    /^[a-z]+:\/\//i.test(trimmed)
      ? trimmed
      : /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(trimmed)
        ? `http://${trimmed}`
        : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.search = "";
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname === "/" ? "" : pathname}`;
}

function firstConfigured(values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()));
}

export function dashboardBaseUrl(): string {
  const configured = firstConfigured([
    process.env.APP_BASE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]);
  if (configured) return normalizeBaseUrl(configured);
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  throw new Error("No dashboard base URL configured");
}

export function arvoBaseUrl(): string {
  const configured = firstConfigured([
    process.env.ARVO_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]);
  if (configured) return normalizeBaseUrl(configured);
  return `${dashboardBaseUrl()}/arvo`;
}
