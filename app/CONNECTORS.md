# Connectors — connections, auth & recommendations

The living reference for how data gets into these dashboards: what's connected,
how auth is set up, the full provider catalog, and the recommendations we've
landed on. **Keep this updated** as connections change (see the checklist at the
end). For *building* a new connector, jump to [Authoring a new connector](#authoring-a-new-connector).

Related docs: [DEPLOY.md](./DEPLOY.md) (run/ship), [REPORTS.md](./REPORTS.md)
(PDF/email), and the debug endpoint `GET /api/debug/<slug>` (live vs demo status
per source — uncached).

---

## How data flows

- Each client in [`config/clients.ts`](./config/clients.ts) lists `sources`
  (`{ type, config }`). A **connector** (`lib/connectors/*`) turns one provider's
  API into normalized panels.
- A source goes **live** only when **both** its credentials (env var) **and** its
  `config` (property id, site url, account id) are present. Otherwise it shows
  deterministic **demo data** — the page never breaks on a missing/failing source.
- Provider calls are capped (p-limit) and cached hourly (ISR). Live fetches use
  `fetchJson` (ofetch retry/timeout + zod validation).

---

## Google auth (GA4 + Search Console)

Both use the shared [`googleAuth.ts`](./lib/connectors/googleAuth.ts), which
supports two methods — **OAuth is preferred when present**.

**Current method: OAuth Web client.** Set in project env:

| Env var | What |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | from the OAuth Web client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | from the OAuth Web client |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | minted once via consent (below) |

**Mint the refresh token** (OAuth Playground): add
`https://developers.google.com/oauthplayground` as a redirect URI on the client →
in Playground, gear → "Use your own OAuth credentials" (paste id/secret) → enter
both scopes → Authorize → Exchange for tokens → copy the refresh token.

Scopes (grant **both** so Search Console works too):
```
https://www.googleapis.com/auth/analytics.readonly
https://www.googleapis.com/auth/webmasters.readonly
```

> ⚠️ Set the OAuth **consent screen to "In production"** — in "Testing" the
> refresh token expires after 7 days and sources silently fall back to demo.

**Alternative: service account.** `GA_SERVICE_ACCOUNT_KEY` (raw or base64 JSON);
grant the service-account email Viewer on each GA4 property + as a user in Search
Console. No consent flow, no expiry — simpler for pure server-side, but we chose
OAuth per the current credential.

Verify with `/api/debug/<slug>` → expect `googleAuth.method: "oauth"` and the
GA4/Search source `status: "live"`.

---

## Client connection status

GA4 Property IDs wired in `config/clients.ts` (✅ real, ⬜ placeholder — need the
Property ID from **Admin → Property Settings**, *not* the `G-XXXX` Measurement ID):

| Client | Slug | GA4 Property ID |
| --- | --- | --- |
| ArtForm Agency | `artform` | ✅ 310586485 |
| BBB National Programs | `bbbnp` | ✅ 302989852 |
| ISEA | `isea` | ✅ 333478304 |
| Maximus | `maximus` | ✅ 302350399 |
| Miami Federal | `miami-federal` | ✅ 521857796 |
| Sigma Defense | `sigma-defense` | ✅ 298141839 |
| Winterscale | `winterscale` | ✅ 398292533 |
| CISA | `cisa` | ⬜ placeholder |
| Mocktails | `mocktails` | ⬜ placeholder |
| Tanaq | `tanaq` | ⬜ placeholder |
| Stanton Communications | `stanton` | ⬜ placeholder |
| Verasole / Calibre | `verasole-calibre` | ⬜ placeholder |
| Minburn Tech | `minburn-tech` | ⬜ placeholder |
| GovCon IDEATORS | `govcon-ideators` | ⬜ placeholder |

Other sources per client (Google Ads, LinkedIn, Mailchimp, etc.) are placeholders
until their credentials + real config are supplied — see the catalog below.

---

## Provider catalog

Every registered connector, its `type`, category, and the env var(s) that make it
live. "Cost/access" flags the ones with friction.

### Analytics
| Provider | `type` | Auth (env) | Cost / access |
| --- | --- | --- | --- |
| Google Analytics 4 | `ga4` | Google OAuth / service acct | **Free** |
| Search Console | `search-console` | Google OAuth / service acct | **Free** |
| Plausible | `plausible` | `PLAUSIBLE_API_KEY` | Paid / self-host |
| Matomo | `matomo` | `MATOMO_TOKEN` (+ base url) | Free (self-host) |

### Advertising
| Provider | `type` | Auth (env) | Cost / access |
| --- | --- | --- | --- |
| Google Ads | `google-ads` | OAuth refresh + `GOOGLE_ADS_DEVELOPER_TOKEN` | Free API, dev-token application |
| Meta Ads | `meta-ads` | `META_ACCESS_TOKEN` | Free API, app review |
| LinkedIn Ads | `linkedin-ads` | `LINKEDIN_ACCESS_TOKEN` | **Expensive / gated** |
| TikTok Ads | `tiktok-ads` | `TIKTOK_ACCESS_TOKEN` | Business API approval |
| Pinterest Ads | `pinterest-ads` | `PINTEREST_ACCESS_TOKEN` | Free API, app review |
| Snapchat Ads | `snapchat-ads` | `SNAPCHAT_ACCESS_TOKEN` | Free API, app review |

### Payments / E-commerce
| Provider | `type` | Auth (env) |
| --- | --- | --- |
| Stripe | `stripe` | `STRIPE_SECRET_KEY` |
| Square | `square` | `SQUARE_ACCESS_TOKEN` |
| PayPal | `paypal` | `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` |
| Shopify | `shopify` | `SHOPIFY_ACCESS_TOKEN` |

### Email / CRM / Marketing
| Provider | `type` | Auth (env) |
| --- | --- | --- |
| Mailchimp | `mailchimp` | `MAILCHIMP_API_KEY` |
| SendGrid | `sendgrid` | `SENDGRID_API_KEY` |
| Klaviyo | `klaviyo` | `KLAVIYO_API_KEY` |
| ActiveCampaign | `activecampaign` | `ACTIVECAMPAIGN_API_TOKEN` (+ url) |
| HubSpot | `hubspot` | `HUBSPOT_ACCESS_TOKEN` |

### Product / Dev / Infra
| Provider | `type` | Auth (env) |
| --- | --- | --- |
| PostHog | `posthog` | `POSTHOG_API_KEY` (+ host) |
| Amplitude | `amplitude` | `AMPLITUDE_API_KEY` / `AMPLITUDE_SECRET_KEY` |
| GitHub | `github` | `GITHUB_TOKEN` |
| Cloudflare | `cloudflare` | `CLOUDFLARE_API_TOKEN` |
| Sentry | `sentry` | `SENTRY_AUTH_TOKEN` |
| Linear | `linear` | `LINEAR_API_KEY` |

### Support / Scheduling / Ops / Video / Search
| Provider | `type` | Auth (env) |
| --- | --- | --- |
| Zendesk | `zendesk` | `ZENDESK_API_TOKEN` (+ subdomain/email cfg) |
| Intercom | `intercom` | `INTERCOM_ACCESS_TOKEN` |
| Calendly | `calendly` | `CALENDLY_ACCESS_TOKEN` |
| Zoom | `zoom` | `ZOOM_ACCOUNT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` |
| Twilio | `twilio` | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` |
| Airtable | `airtable` | `AIRTABLE_API_KEY` |
| Typeform | `typeform` | `TYPEFORM_ACCESS_TOKEN` |
| YouTube | `youtube` | `YOUTUBE_API_KEY` — **Free** |
| Bing Webmaster | `bing-webmaster` | `BING_WEBMASTER_API_KEY` |

All env vars are documented in [`.env.example`](./.env.example).

---

## Recommendations

### Social media without expensive APIs
LinkedIn's API is costly and X's is now paid, so **don't** build per-platform
paid integrations for organic social. Strategy:

1. **Use free official APIs where they're free** — **YouTube** (`youtube`, done),
   **Meta Graph** for Facebook Pages + Instagram Business (free, app review),
   **Google Business Profile** (on the Google auth we already have).
2. **Everything else (LinkedIn, X, TikTok organic) → a Google Sheets connector.**
   An account manager exports native analytics (e.g. LinkedIn Page → Analytics →
   Export) or maintains a metrics tab; the dashboard reads it via the **same
   Google credential** (Sheets API is free, add scope
   `https://www.googleapis.com/auth/spreadsheets.readonly`). No social-platform
   token, no scraping, resilient, and covers any platform at once.
   - Tradeoff: someone/automation keeps the sheet fed (native scheduled export,
     Zapier/Make, or manual monthly). Fine for client reporting.
3. **Avoid** scraping (ToS/brittle/IP-bans) and reseller/aggregator tokens
   (Phyllo/Ayrshare/Metricool) unless you already pay for the tool.

> **Proposed, not yet built:** a `gsheets` connector (`config: { spreadsheetId,
> tab, range }`) as the universal token-free ingestion path.

### Advanced analytics (BI) — semantic layer
For **cross-filtering, drill-downs, dynamic calculations, and NLQ** (branded UI,
no viewer tokens), there's a **boring-semantic-layer + DuckDB** service in
[`/semantic`](../semantic/README.md). The app queries it server-to-server via
[`lib/semantic.ts`](./lib/semantic.ts) + the `/api/semantic` proxy
(`SEMANTIC_API_URL` / `SEMANTIC_API_TOKEN`). Scaffolded + verified with demo
data; next steps (real per-client extracts, cross-filter UI, Claude-powered NLQ)
are in the semantic README. **Smart Narratives** already ship in-app
(`lib/narrative.ts`).

**Client scoping (server-enforced):** every `/api/semantic` query must name the
requesting page's `client` slug (validated against `config/clients.ts`), and the
server force-injects a `client = <slug>` filter — overwriting anything the
browser sent — before the query reaches the semantic service
(`runSemanticQuery` in [`lib/semantic.ts`](./lib/semantic.ts); pure policy
helpers + tests in [`lib/explore.ts`](./lib/explore.ts)). Models without a
`client` dimension are rejected (400) unless allowlisted in
`SHARED_SEMANTIC_MODELS` (deny-by-default, currently empty). `GET
/api/semantic/models` stays unscoped on purpose: it returns schema *names*, not
client data. So the shared bearer token can never be used to read another
client's rows, even with a hand-crafted request.

### AI referrals & the AI Score
Every GA4 dashboard ships, **by default**, with AI-visibility panels — the
GEO / answer-engine question agencies increasingly field ("how much is AI
sending us?"). No extra config: it rides on the existing GA4 property.

- **AI-referred sessions** — sessions whose GA4 *session source* is an AI
  assistant (ChatGPT, Perplexity, Gemini, Copilot, Claude, Grok, DeepSeek,
  Meta AI, Le Chat, You.com, Poe, Phind). Matched by host token in
  [`lib/connectors/aiSources.ts`](./lib/connectors/aiSources.ts) — add a source
  there as new engines appear.
- **AI-referred pages** — which landing pages those assistants surface, and via
  which engine.
- **AI assistants** — the mix of answer engines driving traffic.
- **AI Score (0–100)** — a transparent composite of five GA4-derived signals:

  | Signal | Weight | Full marks at |
  | --- | --- | --- |
  | AI traffic share (AI ÷ all sessions) | 35% | ≥ 3% |
  | Momentum (vs prior period) | 20% | ≥ +100% |
  | Engagement quality (AI vs site engagement) | 15% | ≥ 2× site |
  | Assistant diversity (distinct engines) | 15% | ≥ 5 |
  | Page coverage (distinct AI-referred pages) | 15% | ≥ 20 |

  Targets/weights are constants (`AI_SCORE_TARGETS`, `AI_SCORE_WEIGHTS`) — tune
  as the AI-referral baseline shifts. Grades: A+ ≥85, A ≥70, B ≥55, C ≥40, else D.

The AI-referred pulls use a **server-side GA4 source filter** (not client-side
slicing) so low-volume AI rows are never truncated by a row cap — the counts,
assistant list and page coverage are accurate.

Search Console's **Keyword breakdown** panel (top queries with clicks, position,
CTR and impressions) is likewise a default — it lights up once a real Search
Console site URL + access are in place.

### Crawl errors & backlinks
- **Crawl errors / index health (Google, existing OAuth).** Every Search
  Console section adds index-health panels from the **Sitemaps API** — index
  coverage (indexed ÷ submitted), URLs *not indexed*, sitemap **errors** and
  **warnings**, and a "sitemaps needing attention" table. No new credential.
  > Note: Google **retired** the old aggregate Crawl Errors API; the modern API
  > exposes crawl/index health via sitemaps + per-URL Inspection only. Sitemap
  > errors/warnings + not-indexed are the honest, available Google signal.
- **Crawl errors + backlinks (Bing Webmaster, free key).** Google has **no API
  for backlinks** (the GSC "Links" report is UI-only), so the token-free home
  for backlinks is **Bing Webmaster Tools** (`BING_WEBMASTER_API_KEY`). The
  `bing-webmaster` connector now adds **Backlinks** (total inbound links + top
  linked pages via `GetLinkCounts`) and **Crawl errors / pages-in-index** (via
  `GetCrawlStats`). Attached to ArtForm + BBBNP as examples; add a
  `bing-webmaster` source (with the site verified in Bing) to any client.
  Paid alternatives for richer backlinks: Ahrefs, Majestic, Moz, Semrush.

### Auth patterns cheat-sheet
When adding a provider, copy the closest existing one — see the table in
[Authoring a new connector](#auth--copy-the-closest-example).

---

## Keeping this doc updated

Update this file when you:
- connect a source (flip ⬜→✅ in the status table, note the real config value);
- change the Google auth method or scopes;
- add a connector (add a catalog row);
- make an integration decision worth remembering (add to Recommendations).

---

# Authoring a new connector

A connector teaches the platform to read one API. The dashboard is
provider-agnostic — a connector's only job is to turn an API response into
normalized **panels**, and the UI renders them. Adding a provider never touches
routing or components.

## The 3-step process

1. **Copy the template.** Start from
   [`lib/connectors/TEMPLATE.ts`](./lib/connectors/TEMPLATE.ts) →
   `lib/connectors/myProvider.ts`. Rename the symbols and fill in `fetchLive`.
2. **Register it.** Add it to the `connectors` map in
   [`lib/connectors/index.ts`](./lib/connectors/index.ts):
   ```ts
   import { myProviderConnector } from "./myProvider";
   // …
   [myProviderConnector.type]: myProviderConnector,
   ```
3. **Use it.** Add a source to a client in `config/clients.ts`:
   ```ts
   { type: "my-provider", config: { /* whatever fetchLive needs */ } }
   ```
   …and add any new env vars to `.env.example`.

That's it. Build (`pnpm --filter @artform/dashboards build`) and the new section
appears on every client that lists it.

## The contract

```ts
interface Connector<Config> {
  type: string;       // unique id used in clients.ts ("ga4", "stripe", …)
  label: string;      // dashboard section heading
  category: string;   // grouping badge ("Analytics", "Payments", …)
  isLive(config): boolean;                 // are credentials present?
  fetch(config, ctx): Promise<ConnectorResult>;  // → normalized panels
}
```

`ctx` gives you `{ range: "7d"|"28d"|"90d", days: number }`.

### Panels (the only output that matters)

```ts
// KPI card. format: number | compact | percent | decimal | currency | duration
{ kind: "stat", label, value, format, delta?, invertDelta?, currency? }

// Line chart, one or more series. x = "YYYY-MM-DD".
{ kind: "timeseries", title, series: [{ name, points: [{ x, y }] }] }

// Ranked list. display: donut | bar | table
{ kind: "breakdown", title, display, rows: [{ label, value, sublabel? }], valueFormat? }
```

- `percent` expects a **0..1 ratio** (it multiplies by 100).
- `invertDelta: true` makes an increase render red (use for cost, errors, avg
  position, churn).
- A connector can emit any mix of panels — stats-only, or no breakdown, etc.

## Two hard rules

1. **Always provide a mock fallback.** `fetchMock` must return the same panel
   shape as `fetchLive`, seeded by config so demo numbers are stable. This keeps
   the dashboard rendering with zero credentials and during outages.
2. **Never throw out of `fetch`.** Catch, `console.error`, and return the mock
   with `isMock: true` + `error`. One bad source must not break a client's page.

## Auth — copy the closest example

| Pattern | Copy from | Notes |
| --- | --- | --- |
| API key in header | `plausible.ts`, `sendgrid.ts` | `Authorization: Bearer <key>` |
| API key, custom header | `tiktokAds.ts`, `activecampaign.ts` | e.g. `Access-Token`, `Api-Token` |
| HTTP Basic | `mailchimp.ts`, `twilio.ts`, `zendesk.ts` | `Buffer.from("user:pass").toString("base64")` |
| Google service account | `searchConsole.ts` + `googleAuth.ts` | `googleAccessToken(scopes)` → bearer for any Google REST API |
| OAuth refresh-token | `googleAds.ts` | exchange refresh token → access token (cache it) |
| OAuth client-credentials | `paypal.ts`, `zoom.ts` | client id/secret → token (cache it) |
| GraphQL | `cloudflare.ts`, `linear.ts` | POST `{ query, variables }` |

## Fetching: use `fetchJson` (retry + validation)

Prefer [`http.ts`](./lib/connectors/http.ts)'s `fetchJson(schema, url, opts)` over
raw `fetch`. It runs through **ofetch** (timeout + retry with backoff, so one
flaky provider can't hang the page) and validates the response with a **zod**
schema, turning an unexpected payload into a clean error → mock fallback instead
of a downstream `NaN`. See [`plausible.ts`](./lib/connectors/plausible.ts) and
the template for the pattern:

```ts
const schema = z.object({ daily: z.array(z.object({ date: z.string(), value: z.number().nullish() })).default([]) });
const json = await fetchJson(schema, url, { headers: { Authorization: `Bearer ${token}` } });
```

Shared helpers live in [`util.ts`](./lib/connectors/util.ts)
(`rangeDates`, `pct`, `num`, `dateNDaysAgo` — date math via date-fns) and
[`mock.ts`](./lib/connectors/mock.ts) (`rng`, `mockSeries`, `mockDelta`).
Google auth is in [`googleAuth.ts`](./lib/connectors/googleAuth.ts).

## Testing your connector

- **Demo render:** leave creds unset, run `dev`, open a client that lists your
  source. The section should render with a "demo data" badge.
- **Live path:** set the env var (even to a dummy value) to force `fetchLive`.
  A well-formed request that returns 401/403 proves the URL/headers are right;
  the page should still render (fallback). Watch the server log for
  `[my-provider] live fetch failed: …`.
- **Real data:** set a real credential + config and confirm numbers + deltas.

## Period-over-period deltas

Stats can show a `delta` (% vs the previous equal-length window). Use
`rangeDates(ctx.days)` for `{ start, end, prevStart, prevEnd }`, run a second
aggregate query for the previous window, and `pct(curr, prev)`. See `googleAds.ts`
or `shopify.ts`. Deltas are optional — omit when the API can't supply history.
