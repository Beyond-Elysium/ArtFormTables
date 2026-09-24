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

export function arvoBaseUrl(): string {
  const configured = process.env.ARVO_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured?.trim()) return normalizeBaseUrl(configured);
  if (process.env.NODE_ENV === "development") return "http://localhost:3000/arvo";
  throw new Error("No Arvo base URL configured");
}
