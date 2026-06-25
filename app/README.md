# ArtForm Dashboards

Multi-client analytics dashboards. Each client gets a **subdomain**
(`acme.dashboards.artform.com`) that renders a branded dashboard aggregating
**any number of data sources** — Google Analytics 4, Search Console, Google Ads,
Bing Webmaster, and anything else you add. No client login required.

Built on the ArtForm-branded [`@tabler/core`](../core) design system + Next.js.

## The connector framework

The core idea: the dashboard is **provider-agnostic**. Every data source
implements one small contract (`lib/connectors/types.ts`):

```ts
interface Connector<Config> {
  type: string;        // "ga4", "search-console", "google-ads", …
  label: string;
  category: string;    // "Analytics" | "Search" | "Advertising" | …
  isLive(config): boolean;
  fetch(config, ctx): Promise<ConnectorResult>;  // → normalized Panel[]
}
```

A connector's only job is to turn its own API response into normalized
**panels** — `stat` (KPI card), `timeseries` (chart), or `breakdown`
(donut / bar / table). The dashboard renders panels generically, so **adding a
new provider never touches the UI**.

```
lib/connectors/
  types.ts          ← Panel / Connector contract
  index.ts          ← registry + fetchClientData() fan-out
  googleAuth.ts     ← shared service-account token helper
  mock.ts           ← deterministic demo-data helpers
  ga4.ts            ← Google Analytics 4    (service account)
  searchConsole.ts  ← Google Search Console (service account)
  googleAds.ts      ← Google Ads            (OAuth + developer token)
  bingWebmaster.ts  ← Bing Webmaster Tools  (API key)
  metaAds.ts        ← Meta Ads (FB/IG)      (access token)
  linkedinAds.ts    ← LinkedIn Ads          (OAuth bearer)
  mailchimp.ts      ← Mailchimp             (API key, HTTP Basic)
  shopify.ts        ← Shopify               (Admin API token)
  stripe.ts         ← Stripe                (secret key)
  plausible.ts      ← Plausible Analytics   (API key)
  youtube.ts        ← YouTube               (Data API key)
  tiktokAds.ts      ← TikTok Ads            (access token)
  hubspot.ts        ← HubSpot CRM           (private-app token)
  sendgrid.ts       ← SendGrid              (API key)
  posthog.ts        ← PostHog               (personal API key)
  matomo.ts         ← Matomo Analytics      (token_auth)
```

All sixteen ship with a live REST path **and** a deterministic mock fallback, so
the dashboard renders fully with no credentials and each source flips to live
the moment its credentials + config are present. Categories span Analytics,
Search, Advertising, Email, E-commerce, Payments, Video, CRM, and Product.

### Adding a new API (the whole process)

1. Create `lib/connectors/myProvider.ts` exporting a `Connector`. Fetch from the
   API in `fetch()`, map the response to `Panel[]`, and fall back to `mock.ts`
   helpers when credentials are absent.
2. Register it in `lib/connectors/index.ts`.
3. Reference its `type` in a client's `sources` in `config/clients.ts`.

That's it — no UI, routing, or schema changes. The three bundled auth styles
(service account, OAuth + developer token, API key) cover most APIs; copy the
closest one.

## Clients & routing

- **`config/clients.ts`** — registry of clients. Each has a `subdomain`, `name`,
  optional brand colours, and a list of `sources` (`{ type, config }`).
- **`middleware.ts`** — maps the request's subdomain to a client and rewrites to
  `/client/<subdomain>`.
- **`app/client/[subdomain]/page.tsx`** — fans out across the client's sources in
  parallel (`fetchClientData`) and renders a `PanelSection` per source. Cached
  hourly via ISR.

## Local development

```sh
pnpm install
pnpm --filter @artform/dashboards dev
```

Then visit a client subdomain on localhost:

- http://acme.localhost:3000   (GA4 + Search Console + Google Ads + Bing)
- http://globex.localhost:3000 (GA4 + Search Console)
- http://localhost:3000        (apex landing / client index)

`*.localhost` resolves to 127.0.0.1 in modern browsers. With no credentials set
you'll see a "Demo data" banner and deterministic sample metrics for every
source.

## Going live

Set credentials per provider (see `.env.example`):

| Source | Auth | What to set |
| --- | --- | --- |
| GA4 | Service account (Viewer on the property) | `GA_SERVICE_ACCOUNT_KEY`, `propertyId` in config |
| Search Console | Same service account (user on the SC site) | `GA_SERVICE_ACCOUNT_KEY`, `siteUrl` in config |
| Google Ads | OAuth2 + developer token | `GOOGLE_ADS_*`, `customerId` in config |
| Bing Webmaster | API key | `BING_WEBMASTER_API_KEY`, `siteUrl` in config |
| Meta Ads | Access token (ads_read) | `META_ACCESS_TOKEN`, `adAccountId` in config |
| LinkedIn Ads | OAuth bearer (r_ads_reporting) | `LINKEDIN_ACCESS_TOKEN`, `accountId` in config |
| Mailchimp | API key (`…-usNN`) | `MAILCHIMP_API_KEY` |
| Shopify | Admin API token | `SHOPIFY_ACCESS_TOKEN`, `shop` in config |
| Stripe | Secret / restricted key | `STRIPE_SECRET_KEY` |
| Plausible | API key | `PLAUSIBLE_API_KEY`, `siteId` in config |
| YouTube | Data API key | `YOUTUBE_API_KEY`, `channelId` in config |
| TikTok Ads | Access token | `TIKTOK_ACCESS_TOKEN`, `advertiserId` in config |
| HubSpot | Private-app token | `HUBSPOT_ACCESS_TOKEN` |
| SendGrid | API key | `SENDGRID_API_KEY` |
| PostHog | Personal API key | `POSTHOG_API_KEY`, `projectId` in config |
| Matomo | token_auth | `MATOMO_BASE_URL`, `MATOMO_TOKEN`, `siteId` in config |

GA4 and Search Console share one Google service account: enable the
**Google Analytics Data API** and **Search Console API** in the GCP project,
then add the service-account email as a Viewer/user on each property/site.
Base64-encode the key into `GA_SERVICE_ACCOUNT_KEY`. A source flips to live
automatically once its credentials + config are present; on any live error it
logs and falls back to demo data so the dashboard never breaks.

### Google Ads specifics

Google Ads doesn't use the service account. You need:

1. A **developer token** (Google Ads account → API Center).
2. An **OAuth2 client** (GCP → Credentials → OAuth client, "Desktop"/"Web").
3. A **refresh token** for that client, generated once by an account that can
   see the customer — e.g. the
   [OAuth playground](https://developers.google.com/oauthplayground/) with scope
   `https://www.googleapis.com/auth/adwords`, or a one-off script.

Set `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`,
`GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_OAUTH_REFRESH_TOKEN`, and (if the
customer sits under a manager account) `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. Put each
client's `customerId` in `config/clients.ts`. The connector exchanges the
refresh token for an access token (cached until expiry) and runs GAQL via
`googleAds:searchStream`.

## Deploy (Vercel)

- New Vercel project rooted at `app/`.
- Add a **wildcard domain** `*.dashboards.artform.com` (DNS: wildcard `CNAME`
  → Vercel). The middleware does per-tenant rewriting.
- Set the provider env vars and `NEXT_PUBLIC_ROOT_DOMAIN` in project env.

## Security note

Dashboards are **public** by design (anyone with the URL sees that client's
numbers). All API **credentials stay server-side** — only aggregated metrics
reach the browser. Add a password gate later if access control is needed.
