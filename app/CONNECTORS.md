# Creating a connector

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
