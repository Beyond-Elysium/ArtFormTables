import {
  IconActivity,
  IconChartBar,
  IconClick,
  IconClock,
  IconCurrencyDollar,
  IconEye,
  IconMail,
  IconPercentage,
  IconShoppingCart,
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
};

/** Heuristic: map a metric label to an icon key. */
function keyForLabel(label: string): string {
  const l = label.toLowerCase();
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
