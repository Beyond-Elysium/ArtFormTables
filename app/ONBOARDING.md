# Onboarding a new client

The end-to-end recipe for adding a client dashboard, in order. Everything is
config — no new code unless the client needs a provider we haven't built
(then see [CONNECTORS.md → Authoring a new connector](./CONNECTORS.md#authoring-a-new-connector)).

## 1. Registry entry (`config/clients.ts`)

- [ ] Add an entry to `clientDefs`. The **slug** becomes the URL
      (`site.com/<slug>`): lowercase letters, digits, hyphens only — zod
      validates at build and a bad entry fails `pnpm build` loudly.
- [ ] **Brand**: `brand: { primary, accent }` as `#rrggbb`. Pick a `primary`
      dark enough to carry white text — `readableTextColor()` (WCAG, in
      `lib/contrast.ts`) auto-picks badge/chip foregrounds, but a mid-tone
      primary will flip them near-black and look off-brand. Optional `logo` URL
      replaces the name in the header.
- [ ] **Sources** cheatsheet (each goes live only when its env credential AND
      real config are present; otherwise it renders demo data):

```ts
{ type: "ga4",            config: { propertyId: "310586485" } },            // numeric Property ID, NOT G-XXXX
{ type: "search-console", config: { siteUrl: "https://example.com/" } },    // or "sc-domain:example.com"
{ type: "bing-webmaster", config: { siteUrl: "https://example.com/" } },
{ type: "google-ads",     config: { customerId: "123-456-7890", currency: "USD" } },
{ type: "linkedin-ads",   config: { accountId: "512345678", currency: "USD" } },
{ type: "mailchimp",      config: {} },
{ type: "gsheets",        config: { spreadsheetId: "1AbC…", tab: "Metrics" } }, // token-free ingestion (social etc.)
```

- [ ] **Second property / custom tab?** Give the source an explicit
      `id` and add a view (BBBNP's CISR/IRI is the model — `aiInsights: false`
      stops the secondary GA4 section repeating the full AI block):

```ts
views: [{ name: "CISR/IRI", sourceIds: ["ga4-cisr"] }],
sources: [ …, { type: "ga4", id: "ga4-cisr", label: "Client CISR/IRI",
                config: { propertyId: "499713205", aiInsights: false } } ]
```

- [ ] `npx tsc --noEmit && pnpm build` — the registry is zod-validated (dupe
      slugs, bad hex, views referencing unknown source ids all fail here).

## 2. Google-side grants (GA4 + Search Console)

The app authenticates as **one OAuth consenting account** (`GOOGLE_OAUTH_*`
env, already global). Per client, that account needs read access:

- [ ] GA4: Admin → Property access management → add the consenting account as
      **Viewer** on the client's property.
- [ ] Search Console: Settings → Users and permissions → add it (Full or
      Restricted) on the site. Match `siteUrl` to the property type exactly:
      URL-prefix = `https://example.com/` (trailing slash), domain property =
      `sc-domain:example.com`.

## 3. Bing Webmaster

- [ ] In Bing Webmaster Tools (any account holding `BING_WEBMASTER_API_KEY`),
      use **Import from Google Search Console** — verifies the site in one
      click via the GSC grant above. One API key covers every site on the
      account; no per-client env var.

## 4. Env vars

| Scope | Vars | Notes |
| --- | --- | --- |
| Global, set once | `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`, `BING_WEBMASTER_API_KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `SEMANTIC_API_URL/TOKEN`, `ANTHROPIC_API_KEY` (NLQ), `RESEND_API_KEY` + `CRON_SECRET` (reports) | Nothing to add per client |
| Per-client, in the registry (not env) | `propertyId`, `siteUrl`, `customerId`, `accountId`, `spreadsheetId` | Real values, no placeholders |
| Per-provider keys (only if the client uses them) | `MAILCHIMP_API_KEY`, `HUBSPOT_ACCESS_TOKEN`, `LINKEDIN_ACCESS_TOKEN`, … | Full list: `.env.example` |

## 5. Semantic layer (Explore history + AI Score trend)

- [ ] Mirror the client in `semantic/clients.yaml` (**same slug**; it becomes
      the `client` column and the server-enforced filter):

```yaml
acme:
  ga4_property: "123456789"
  # google_ads_customer_id: "123-456-7890"
```

- [ ] Backfill on the VM, then refresh rollups:

```sh
cd semantic && source .venv/bin/activate
python extract_ga4.py --client acme        # default window: last 365 days; idempotent
python rollups.py
```

## 6. Verify

- [ ] `GET /api/debug/<slug>?token=<CRON_SECRET>` — uncached, runs every
      source: `googleAuth.method` should be `oauth`; each source reports
      `status: "live"` or `"demo"` plus any `error`. **demo** = missing
      credential, placeholder config (`*.example`, `000-000-0000`) or a failing
      live fetch (see `error`) — the page still renders on deterministic mock
      data with a "Sample data" banner. **live** = real numbers.
- [ ] Open `/<slug>` — check branding and tabs, and sanity-check figures
      against the provider UI (the page caches hourly via ISR; the debug
      endpoint is always uncached).

## 7. Reports (opt-in)

- [ ] Only when the client wants scheduled PDFs:
      `report: { recipients: ["ops@client.com"], enabled: true }` — the Monday
      cron emails every enabled client ([REPORTS.md](./REPORTS.md)). Leave
      `enabled: false` (or omit) otherwise; on-demand PDF download always works.
