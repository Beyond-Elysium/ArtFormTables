# Standing up ArtForm Dashboards

A practical runbook: run it locally, configure a client, connect real data, and
deploy so clients can view their dashboard at their own subdomain.

---

## 1. Run it locally (2 minutes)

From the repo root:

```sh
pnpm install
pnpm --filter @artform/dashboards dev
```

Open:

- http://localhost:3000 — landing / client index
- http://acme.localhost:3000 — a client dashboard (subdomain routing)
- http://umbrella.localhost:3000, http://hooli.localhost:3000, … — other demos

`*.localhost` resolves to 127.0.0.1 automatically in modern browsers — no
hosts-file edits. With no credentials set you'll see a **"Demo data"** banner and
deterministic sample metrics for every source. That's expected.

> Tip: `pnpm --filter @artform/dashboards build && … start` runs the production
> build. The `prebuild` step compiles the branded `@tabler/core` CSS first.

---

## 2. Add or configure a client

Everything about a client lives in [`config/clients.ts`](./config/clients.ts).
A client = a subdomain + branding + a list of data sources:

```ts
{
  subdomain: "acme",                 // acme.dashboards.artform.com
  name: "Acme Corporation",
  brand: { primary: "#426fb6", accent: "#e41679", logo: "https://…/logo.svg" },
  sources: [
    { type: "ga4",            config: { propertyId: "123456789" } },
    { type: "google-ads",     config: { customerId: "111-111-1111", currency: "USD" } },
    { type: "search-console", config: { siteUrl: "https://acme.com/" } },
  ],
}
```

- `type` must match a registered connector (see the table in [README](./README.md)).
- `config` is the per-source settings that connector needs (property id, site
  URL, customer id, …). Each connector's file documents its `config` shape at the
  top.
- Add a source = add a line. Remove one = delete the line. No redeploy of code
  logic is required beyond shipping the edited file.

There's no database — this file is the source of truth for the MVP.

---

## 3. Connect a data source (credentials)

Secrets live in environment variables, never in `config/clients.ts`.
[`.env.example`](./.env.example) lists every variable. Locally, copy it:

```sh
cp .env.example .env.local
# fill in only the providers you want live; leave the rest blank
```

A source flips from **demo** to **live** automatically once *both* are present:
its credentials (env) **and** its `config` (clients.ts). On any live error it
logs and falls back to demo data, so a misconfigured source never breaks a
client's page.

### Worked example A — Google Analytics 4

1. Google Cloud → create a project → **enable the Google Analytics Data API**.
2. Create a **service account**, download its JSON key.
3. In each client's GA4 property: **Admin → Property Access Management → add the
   service-account email as a Viewer**.
4. Put the **Property ID** (Admin → Property Settings) into the client's
   `ga4` source config.
5. Base64-encode the key into the env var:
   ```sh
   echo "GA_SERVICE_ACCOUNT_KEY=$(base64 -w0 service-account.json)" >> .env.local
   ```
6. Restart. The demo banner for that source disappears.

The same service account also powers **Search Console** — just add the
service-account email as a user on the Search Console property.

### Worked example B — Stripe

1. Stripe Dashboard → Developers → API keys → create a **restricted key** with
   read access (or use a secret key).
2. `echo "STRIPE_SECRET_KEY=rk_live_…" >> .env.local`
3. Add a `{ type: "stripe", config: { currency: "USD" } }` source to the client.
4. Restart.

Other providers follow the same shape — see the credentials table in the README
for which env vars + config each needs.

---

## 4. Deploy to Vercel (wildcard subdomains)

The app is a normal Next.js project; the only special part is the **wildcard
domain** so every client subdomain reaches it.

1. **Import the repo** into Vercel as a new project.
2. **Root Directory:** set to `app`. (`app/vercel.json` pins the framework and
   build command; the build's `prebuild` compiles the branded CSS.)
3. **Environment variables:** add the provider secrets from your `.env.local`,
   plus `NEXT_PUBLIC_ROOT_DOMAIN=dashboards.artform.com`.
4. **Domains:** add a wildcard domain `*.dashboards.artform.com` (and optionally
   the apex `dashboards.artform.com` for the landing page).
5. **DNS:** at your DNS provider, add a wildcard `CNAME`:
   ```
   *.dashboards   CNAME   cname.vercel-dns.com.
   ```
   (Vercel shows the exact target when you add the domain.)
6. Deploy. `acme.dashboards.artform.com` now serves Acme's dashboard; the
   `middleware.ts` maps the subdomain to the client.

Adding a new client in production = edit `config/clients.ts`, commit, push.
Because the domain is a wildcard, the new subdomain works immediately — no DNS
or Vercel change needed.

> Existing `preview/` and `docs/` Vercel projects are untouched; this is a
> separate project rooted at `app/`.

---

## 5. Operations

- **Caching:** dashboards use ISR (`export const revalidate = 3600`) — provider
  responses are cached for an hour, which also respects API rate limits. Lower
  it per page if you need fresher data.
- **Rotating a key:** update the env var in Vercel and redeploy; nothing in the
  repo changes.
- **Access:** dashboards are public by URL by design (credentials stay
  server-side; only aggregated numbers reach the browser). To gate them, add a
  password check in `middleware.ts` keyed off the client — say the word and it's
  a small change.
- **Branding:** `brand.primary` / `brand.accent` drive the dashboard accent
  colors and charts; `brand.logo` swaps the wordmark for an image.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Demo data" banner won't go away | The source's env var **or** its `config` is missing. Both are required. |
| A source shows demo data but others are live | That provider's live call failed — check server logs for `[provider] live fetch failed`. |
| 404 on a subdomain | The subdomain isn't in `config/clients.ts` (case-sensitive label). |
| Build fails on Vercel: cannot find `@tabler/core/dist/...` | Ensure Root Directory is `app` so the `prebuild` runs `pnpm --filter @tabler/core run css`. |
| Local subdomain won't load | Use `http://<sub>.localhost:3000`, not `127.0.0.1`. |

See [CONNECTORS.md](./CONNECTORS.md) to add a brand-new provider.
