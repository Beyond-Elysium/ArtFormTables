# ArtForm Dashboards

Multi-client analytics dashboards. Each client gets a **path**
(`sitename.com/acme`) that renders a branded dashboard aggregating
**any number of data sources** — Google Analytics 4, Search Console, Google Ads,
Bing Webmaster, and anything else you add. No client login required.

Built on the ArtForm-branded [`@tabler/core`](../core) design system + Next.js.

> **Just want to use it?** → [DEPLOY.md](./DEPLOY.md) — run it, configure a
> client, connect real data, and ship it on one domain.
> **Adding a client?** → [ONBOARDING.md](./ONBOARDING.md) — the end-to-end
> checklist (registry → grants → env → semantic sync → verify).
> **Connections, auth, provider catalog & recommendations?** →
> [CONNECTORS.md](./CONNECTORS.md) (the hub; authoring a new provider is a
> section there, alongside [`lib/connectors/TEMPLATE.ts`](./lib/connectors/TEMPLATE.ts)).
> **PDF / email reports?** → [REPORTS.md](./REPORTS.md).

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
  pinterestAds.ts   ← Pinterest Ads         (OAuth bearer)
  snapchatAds.ts    ← Snapchat Ads          (OAuth bearer)
  twilio.ts         ← Twilio                (HTTP Basic)
  zendesk.ts        ← Zendesk               (API token)
  github.ts         ← GitHub                (token)
  calendly.ts       ← Calendly              (OAuth bearer)
  intercom.ts       ← Intercom              (bearer)
  typeform.ts       ← Typeform              (bearer)
  square.ts         ← Square                (bearer)
  paypal.ts         ← PayPal                (OAuth client-credentials)
  cloudflare.ts     ← Cloudflare            (GraphQL, token)
  klaviyo.ts        ← Klaviyo               (API key)
  sentry.ts         ← Sentry                (bearer)
  linear.ts         ← Linear                (API key, GraphQL)
  zoom.ts           ← Zoom                  (OAuth server-to-server)
  amplitude.ts      ← Amplitude             (HTTP Basic)
  activecampaign.ts ← ActiveCampaign        (Api-Token)
  airtable.ts       ← Airtable              (bearer)
```

All thirty-four ship with a live REST path **and** a deterministic mock
fallback, so the dashboard renders fully with no credentials and each source
flips to live the moment its credentials + config are present. Categories span
Analytics, Search, Advertising, Email, E-commerce, Payments, Video, CRM,
Product, Messaging, Support, Developer, Scheduling, Forms, Infrastructure,
Errors, Project Management, Meetings, and Operations.

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

- **`config/clients.ts`** — registry of clients. Each has a `slug`, `name`,
  optional brand colours, and a list of `sources` (`{ type, config }`).
- **`app/[client]/page.tsx`** — the `/<slug>` route. Looks the slug up in the
  registry (`getClientBySlug`), fans out across the client's sources in parallel
  (`fetchClientData`), and renders a `PanelSection` per source. Cached hourly
  via ISR. Unknown slugs render the 404 page.

## Dashboard UX

State lives in the URL (shareable, server-rendered), so any view is linkable:

- **Date range** (`?range=`) — presets `7d`/`28d`/`90d`/`6mo`/`12mo`, or a custom
  window via `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`. Resolved in
  [`lib/range.ts`](./lib/range.ts).
- **Comparison** (`?compare=previous|year`) — fetches a second window and merges
  it in generically (no connector changes): each KPI gains a `vs … prior` value
  and recomputed delta, and each chart gains a dashed "previous" overlay aligned
  on the same axis. See `fetchClientData` in [`lib/connectors/index.ts`](./lib/connectors/index.ts).
- **Views** — `DashboardBody` derives tabs from each source's `category`
  (Overview + Analytics/Advertising/Payments/…); switching is instant (no refetch).
- **A11y/QoL** — badges/nav auto-contrast against the brand color
  ([`lib/contrast.ts`](./lib/contrast.ts)), sticky range controls, a loading
  skeleton, and print styles.

## Local development

```sh
pnpm install
pnpm --filter @artform/dashboards dev
```

Then visit a client path on localhost:

- http://localhost:3000        (landing / client index)
- http://localhost:3000/acme   (GA4 + Search Console + Google Ads + Bing)
- http://localhost:3000/globex (GA4 + Search Console)

With no credentials set you'll see a "Demo data" banner and deterministic sample
metrics for every source.

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
| Pinterest Ads | OAuth bearer | `PINTEREST_ACCESS_TOKEN`, `adAccountId` in config |
| Snapchat Ads | OAuth bearer | `SNAPCHAT_ACCESS_TOKEN`, `adAccountId` in config |
| Twilio | Basic (SID + token) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| Zendesk | API token | `ZENDESK_API_TOKEN`, `subdomain`/`email` in config |
| GitHub | Token | `GITHUB_TOKEN`, `owner`/`repo` in config |
| Calendly | OAuth bearer | `CALENDLY_ACCESS_TOKEN`, `organization` in config |
| Intercom | Bearer | `INTERCOM_ACCESS_TOKEN` |
| Typeform | Bearer | `TYPEFORM_ACCESS_TOKEN`, `formId` in config |
| Square | Bearer | `SQUARE_ACCESS_TOKEN` |
| PayPal | OAuth client-credentials | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` |
| Cloudflare | API token (GraphQL) | `CLOUDFLARE_API_TOKEN`, `zoneTag` in config |
| Klaviyo | API key | `KLAVIYO_API_KEY` |
| Sentry | Auth token | `SENTRY_AUTH_TOKEN`, `organization` in config |
| Linear | API key (GraphQL) | `LINEAR_API_KEY` |
| Zoom | OAuth server-to-server | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` |
| Amplitude | API key + secret (Basic) | `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY` |
| ActiveCampaign | Api-Token | `ACTIVECAMPAIGN_API_URL`, `ACTIVECAMPAIGN_API_TOKEN` |
| Airtable | Access token | `AIRTABLE_API_KEY`, `baseId`/`tableName` in config |

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
- Add your single domain (e.g. `dashboards.artform.com`). No wildcard / DNS
  gymnastics — clients are just paths (`/<slug>`) under it.
- Set the provider env vars in project env.

See [DEPLOY.md](./DEPLOY.md) for the full runbook.

## Security note

Dashboards are **public** by design (anyone with the URL sees that client's
numbers). All API **credentials stay server-side** — only aggregated metrics
reach the browser. Add a password gate later if access control is needed.
