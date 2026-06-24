# ArtForm Dashboards

Multi-client analytics dashboards. Each client gets a **subdomain**
(`acme.dashboards.artform.com`) that renders a branded dashboard fed by **live
Google Analytics 4** data — no client login required.

Built on the ArtForm-branded [`@tabler/core`](../core) design system + Next.js.

## How it works

- **`config/clients.ts`** — registry of clients: `subdomain`, `name`,
  `ga4PropertyId`, optional brand colours. Add a client by adding an entry here.
- **`middleware.ts`** — maps the request's subdomain to a client and rewrites to
  `/_client/<subdomain>`.
- **`lib/ga.ts`** — server-only GA4 Data API client. One agency service account
  reads every client's property. **Falls back to deterministic mock data** when
  no credentials are set, so the UI renders during development.
- **`app/_client/[subdomain]/page.tsx`** — the dashboard (stat cards, traffic
  chart, sources/devices donuts, top pages), cached hourly via ISR.

## Local development

```sh
pnpm install
pnpm --filter @artform/dashboards dev
```

Then visit a client subdomain on localhost:

- http://acme.localhost:3000
- http://globex.localhost:3000
- http://localhost:3000 (apex landing / client index)

`*.localhost` resolves to 127.0.0.1 in modern browsers; no hosts-file edits
needed. Without `GA_SERVICE_ACCOUNT_KEY` you'll see a "Demo data" banner.

## Going live with real GA4 data

1. In Google Cloud, create a project and **enable the Google Analytics Data
   API**.
2. Create a **service account**; download its JSON key.
3. In each client's GA4 property: **Admin → Property Access Management → add the
   service-account email as a Viewer**.
4. Put the client's **GA4 Property ID** (Admin → Property Settings) into
   `config/clients.ts`.
5. Base64-encode the key and set it as an env var:

   ```sh
   echo "GA_SERVICE_ACCOUNT_KEY=$(base64 -w0 service-account.json)" >> .env.local
   ```

6. Restart the dev server. The demo banner disappears and live numbers render.

See `.env.example` for all variables.

## Deploy (Vercel)

- New Vercel project rooted at `app/`.
- Add a **wildcard domain** `*.dashboards.artform.com` (DNS: wildcard `CNAME`
  → Vercel). The middleware does per-tenant rewriting.
- Set `GA_SERVICE_ACCOUNT_KEY` and `NEXT_PUBLIC_ROOT_DOMAIN` in project env.

## Security note

Dashboards are **public** by design (anyone with the URL sees that client's
numbers). The service-account **credentials never reach the browser** — only
aggregated metrics do. Add a password gate later if access control is needed.
