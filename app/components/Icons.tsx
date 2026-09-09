import {
  IconActivity,
  IconBug,
  IconChartBar,
  IconClick,
  IconClock,
  IconCurrencyDollar,
  IconEye,
  IconFiles,
  IconLink,
  IconListCheck,
  IconMail,
  IconPercentage,
  IconPlaylistX,
  IconRobot,
  IconShoppingCart,
  IconSparkles,
  IconTargetArrow,
  IconTicket,
  IconTrendingUp,
  IconUserPlus,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";

/**
 * Metric-card icons, drawn from the official Tabler icon set. `iconForLabel`
 * picks a sensible glyph from a metric's label so every connector gets one for
 * free, with no per-connector wiring.
 */
const ICONS: Record<string, Icon> = {
  users: IconUsers,
  userPlus: IconUserPlus,
  activity: IconActivity,
  percentage: IconPercentage,
  currency: IconCurrencyDollar,
  cart: IconShoppingCart,
  mail: IconMail,
  ticket: IconTicket,
  clock: IconClock,
  eye: IconEye,
  click: IconClick,
  trending: IconTrendingUp,
  chart: IconChartBar,
  sparkles: IconSparkles,
  robot: IconRobot,
  link: IconLink,
  listCheck: IconListCheck,
  listX: IconPlaylistX, // Tabler has no IconListX; PlaylistX is the closest list-with-x
  bug: IconBug,
  files: IconFiles,
  target: IconTargetArrow,
};

/**
 * Exact-label mappings (lowercased) checked before the heuristics — the AI/SEO
 * and conversion KPIs would otherwise fall through to generic glyphs.
 */
const EXACT: Record<string, string> = {
  "ai score": "sparkles",
  "ai-referred sessions": "robot",
  "ai referred sessions": "robot",
  backlinks: "link",
  "index coverage": "listCheck",
  "not indexed": "listX",
  "crawl errors": "bug",
  "pages in index": "files",
  "avg. session duration": "clock",
  "avg session duration": "clock",
  conversions: "target",
};

/** Heuristic: map a metric label to an icon key. */
function keyForLabel(label: string): string {
  const l = label.toLowerCase().trim();
  const exact = EXACT[l];
  if (exact) return exact;
  // AI/SEO family fallbacks (label variants like "AI-referred users").
  if (/(^|\s)ai[- ]/.test(l) || l.startsWith("ai ")) return "sparkles";
  if (/backlink/.test(l)) return "link";
  if (/crawl/.test(l)) return "bug";
  if (/(not indexed|noindex)/.test(l)) return "listX";
  if (/(index|coverage)/.test(l)) return "listCheck";
  if (/(new|signup|sign-up|registration)/.test(l)) return "userPlus";
  if (/(rate|ctr|%|bounce|conversion|deliverability)/.test(l)) return "percentage";
  if (/(user|visitor|subscriber|follower|audience|member|contact)/.test(l)) return "users";
  if (/(session|active|engag|uptime|request|event|run)/.test(l)) return "activity";
  if (/(revenue|sales|spend|cost|payment|mrr|arr|value|gmv|payout|\$|usd)/.test(l)) return "currency";
  if (/(order|cart|checkout|purchase|transaction)/.test(l)) return "cart";
  if (/(email|message|sent|campaign)/.test(l)) return "mail";
  if (/(ticket|issue|support|reply|case)/.test(l)) return "ticket";
  if (/(time|duration|response|wait|avg\.?|latency)/.test(l)) return "clock";
  if (/(view|impression|reach|pageview|watch)/.test(l)) return "eye";
  if (/(click|tap)/.test(l)) return "click";
  if (/(position|rank|score|growth)/.test(l)) return "trending";
  return "chart";
}

export function StatIcon({ label }: { label: string }) {
  const Icon = ICONS[keyForLabel(label)] ?? IconChartBar;
  return <Icon size={22} stroke={2} aria-hidden="true" />;
}
