import type { ReactNode } from "react";

/**
 * Small inline icon set (MIT, Tabler-style stroke icons) so KPI cards can carry
 * a glyph without pulling in an icon package. `iconForLabel` picks a sensible
 * icon from a metric's label so every connector gets one for free.
 */

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<string, ReactNode> = {
  users: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 11h6M19 8v6" />
    </>
  ),
  activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  percentage: (
    <>
      <path d="M5 19 19 5" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </>
  ),
  currency: (
    <>
      <path d="M12 3v18" />
      <path d="M16 7.5a4 4 0 0 0-4-2.5C9.8 5 8 6 8 8s1.8 3 4 3 4 1 4 3-1.8 3-4 3a4 4 0 0 1-4-2.5" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M2 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H5.2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z" />
      <path d="M13 7v10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  click: (
    <>
      <path d="M3 3l7 18 2.5-7.5L20 11 3 3Z" />
    </>
  ),
  trending: <path d="M3 17 9 11l4 4 8-8M21 7v5h-5" />,
  chart: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="11" width="3" height="5" />
      <rect x="12" y="8" width="3" height="8" />
      <rect x="17" y="13" width="3" height="3" />
    </>
  ),
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
  return (
    <svg {...base} aria-hidden="true">
      {PATHS[keyForLabel(label)]}
    </svg>
  );
}
