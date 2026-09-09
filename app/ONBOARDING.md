# Adding a client

Everything is config. No code, unless the client needs a data source we
haven't built yet.

Full field reference: [config/EDITING.md](./config/EDITING.md).

---

## The short version

1. Add an entry to `config/clients.json`
2. Give our Google account access to their GA4 + Search Console
3. Verify at `/api/debug/<slug>`
4. Open `/<slug>`

That's it. Steps 5–7 below are only if you need them.

---

## 1. Add the client

Open `config/clients.json`. Copy an existing entry and change it. The editor
autocompletes every field and flags mistakes as you type.

```jsonc
{
  "slug": "acme",
  "name": "Acme Corp",
  "brand": { "primary": "#333333", "accent": "#e41679" },
  "sources": [
    { "type": "ga4", "config": { "propertyId": "310586485" } },
    { "type": "search-console", "config": { "siteUrl": "https://acme.com/" } },
    { "type": "bing-webmaster", "config": { "siteUrl": "https://acme.com/" } }
  ]
}
```

**Rules:**

- `slug` is the URL. `"acme"` → `/acme`. Lowercase, digits, hyphens. **Renaming it later breaks every link.**
- `propertyId` is the **numeric** GA4 id (`310586485`), not `G-XXXXXXX`.
- `siteUrl` must match Search Console exactly: `https://acme.com/` **with the trailing slash**, or `sc-domain:acme.com` for a domain property.
- Pick a `primary` dark enough for white text to sit on.

Then:

```sh
pnpm build     # fails loudly, naming the client, if anything's wrong
```

## 2. Give our Google account access

The app logs in as **one Google account** for every client. Per client, that
account needs read access:

- **GA4** → Admin → Property access management → add it as **Viewer**
- **Search Console** → Settings → Users and permissions → add it

Without this, that client shows demo data. Everything else can be right and
it'll still be demo — this step is usually the culprit.

## 3. Verify

```
/api/debug/acme?token=<CRON_SECRET>
```

Every source reports `live` or `demo`.

**`demo` means one of three things:**
- The credential isn't set
- The config is still a placeholder (`000-000-0000`, `*.example`)
- The live call failed — the `error` field says why

Demo is safe: the dashboard renders sample numbers with a "Sample data"
banner. Nothing looks broken to a client.

## 4. Open it

`/acme` — check the branding and the tabs, and sanity-check a couple of
numbers against the provider's own UI.

Pages cache for an hour. The debug endpoint never caches.

---

## 5. Bing (optional, 1 minute)

In Bing Webmaster Tools: **Import from Google Search Console**. Verifies the
site in one click off the access you granted in step 2. One key covers every
site — nothing per-client.

## 6. A second GA4 property, or custom tabs (optional)

Give the source an `id`, then reference it from `views`:

```jsonc
"views": [{ "name": "CISR/IRI", "sourceIds": ["ga4-cisr"] }],
"sources": [
  { "type": "ga4", "config": { "propertyId": "302989852" } },
  { "type": "ga4", "id": "ga4-cisr", "label": "Acme CISR/IRI",
    "config": { "propertyId": "499713205", "aiInsights": false } }
]
```

`aiInsights: false` stops the second property repeating the AI block.

Several similar tabs? Give them all the same `"group"` and they collapse into
one dropdown instead of eating five tab slots (Maximus's "Programs").

## 7. Weekly PDF reports (optional)

```jsonc
"report": { "recipients": ["ops@acme.com"], "enabled": true }
```

Monday cron emails every enabled client. Leave it off otherwise — on-demand
PDF download works regardless.

## 8. History beyond GA4's window (optional)

Only if they need Explore / AI Score trends. Mirror the client in
`semantic/clients.yaml` using the **same slug**, then on the VM:

```sh
cd semantic && source .venv/bin/activate
python extract_ga4.py --client acme
python rollups.py
```

---

# What connectors are available

**38 total.** Every one falls back to demo data until its credential is set,
so you can add a source before you have the key.

## The ones we actually use

| Type | What it gives you | Needs |
| --- | --- | --- |
| `ga4` | Users, sessions, pages, conversions, AI traffic, geography map | Google login ✅ |
| `search-console` | Keywords, clicks, impressions, index health | Google login ✅ |
| `bing-webmaster` | **Backlinks**, crawl errors, Bing keywords | `BING_WEBMASTER_API_KEY` ✅ |
| `pagespeed` | Speed + SEO scores, Core Web Vitals | `PAGESPEED_API_KEY` |
| `google-ads` | Spend, clicks, conversions, campaigns | Google login + `GOOGLE_ADS_DEVELOPER_TOKEN` |
| `linkedin-ads` | Impressions, clicks, spend, campaigns | `LINKEDIN_ACCESS_TOKEN` |
| `microsoft-ads` | Bing Ads spend/clicks, Search vs Audience | `MICROSOFT_ADS_*` |
| `hubspot` | Contacts, deals, pipeline | `HUBSPOT_ACCESS_TOKEN` |
| `mailchimp` | Campaigns, opens, clicks | `MAILCHIMP_API_KEY` |
| `gsheets` | **Anything you can put in a spreadsheet** | Google login ✅ |
| `nocodb` | Records from a self-hosted table | `NOCODB_API_TOKEN` |

> `gsheets` is the escape hatch. Any data with no API — offline numbers, a
> manual export, organic social — goes in a Sheet and onto the dashboard with
> no code.

## Everything else, ready when needed

**Ads:** `meta-ads` · `tiktok-ads` · `pinterest-ads` · `snapchat-ads`
**Analytics:** `plausible` · `matomo` · `posthog` · `amplitude`
**Payments:** `stripe` · `square` · `paypal` · `shopify`
**Email:** `klaviyo` · `sendgrid` · `activecampaign`
**Support:** `zendesk` · `intercom` · `twilio`
**Other:** `youtube` · `calendly` · `typeform` · `airtable` · `github` · `linear` · `sentry` · `cloudflare` · `zoom`

Each needs one API key — see [.env.example](./.env.example). Adding one to a
client is a single line in `clients.json`.

## Not built

Ahrefs / Semrush / Moz (paid backlink tools), SAM.gov, and anything else with
an API — roughly a day each. See
[CONNECTORS.md](./CONNECTORS.md#authoring-a-new-connector).

---

# What's set up right now

| Working | Needs a key |
| --- | --- |
| GA4 (all 9 clients) | Google Ads — developer token |
| Search Console | LinkedIn Ads — access token |
| Bing / backlinks | Microsoft Ads — full OAuth set |
| | PageSpeed — free API key |
| | HubSpot — one token per portal |

Google Ads, GA4, Search Console and Sheets all run off **one** Google login —
see [CONNECTORS.md](./CONNECTORS.md#google-auth-ga4--search-console). Grant all
four scopes when you create the token or the others silently stay on demo.
