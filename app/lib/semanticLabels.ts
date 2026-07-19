/**
 * Friendly display names for semantic-layer models and fields.
 *
 * The Explore UI renders these everywhere a name is shown (model dropdown,
 * group-by/measure chips, filter chips, table headers, chart series) while
 * queries keep the raw schema names. Pure and dependency-free.
 */

const MODEL_LABELS: Record<string, string> = {
  ga4: "Website analytics",
  blended: "Cross-source",
};

const FIELD_LABELS: Record<string, string> = {
  // GA4-style raw names
  totalUsers: "Users",
  sessionDefaultChannelGroup: "Channel",
  session_date: "Date",
  screenPageViews: "Page views",
  // Semantic-layer field names
  date: "Date",
  users: "Users",
  sessions: "Sessions",
  channel: "Channel",
  device: "Device",
  country: "Country",
  client: "Client",
  conversions: "Conversions",
  revenue: "Revenue",
  spend: "Spend",
  cost: "Cost",
  // Acronym KPIs — proper case
  cac: "CAC",
  roas: "ROAS",
  ctr: "CTR",
  cpc: "CPC",
  revenue_per_user: "Revenue per user",
  conversion_rate: "Conversion rate",
  cost_per_lead: "Cost per lead",
};

/** "ga4" → "Website analytics"; unknown models get a prettified fallback. */
export function modelLabel(name: string): string {
  return MODEL_LABELS[name] ?? prettifyName(name);
}

/** "sessionDefaultChannelGroup" → "Channel"; unknowns are prettified. */
export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? prettifyName(name);
}

/**
 * Fallback prettifier: camelCase / snake_case / kebab-case → spaced Title
 * Case ("avgSessionDuration" → "Avg Session Duration", "crawl_errors" →
 * "Crawl Errors"). Existing all-caps runs are preserved ("aiScore" aside,
 * "AI_score" → "AI Score").
 */
export function prettifyName(raw: string): string {
  if (!raw) return raw;
  const words = raw
    .replace(/[_-]+/g, " ")
    // Split camelCase boundaries (incl. before a final cap-run like "URL").
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words
    .map((w) => (w === w.toUpperCase() && w.length > 1 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
