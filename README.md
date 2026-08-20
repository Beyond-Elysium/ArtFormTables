# ArtForm Tables

**ArtForm Tables** is a multi-client analytics dashboard platform. One Next.js application serves branded dashboards at path-based URLs such as `https://dashboards.example.com/client-slug`; each dashboard composes metrics from one or more connected data providers without exposing provider credentials to viewers.

The repository contains both the dashboard application and an optional semantic service. The dashboard app is the primary deployment target. The semantic service is a separate, persistent Python process for cross-source analysis and advanced querying.

## What the platform provides

| Capability | How it works |
| --- | --- |
| Multi-client dashboards | A client registry defines each URL slug, display name, brand overrides, data sources, and optional scheduled-report settings. |
| Provider-agnostic data rendering | Each connector converts its provider response into a common panel format. The UI renders those panels without provider-specific pages. |
| Safe demo mode | A connector uses deterministic demo data until the required credentials and source configuration are present; a failed live request also falls back to demo data rather than breaking the dashboard. |
| Shareable analysis | Date ranges, custom dates, and optional previous-period or year-over-year comparisons are encoded in the URL. |
| Branded delivery | Per-client primary and accent colours, plus an optional logo, are configured in the client registry. |
| Reporting | The app supports print-friendly views and optional PDF/email reporting. |
| Semantic analysis | The optional DuckDB-backed service supports authenticated server-to-server queries, cross-filtering foundations, and blended metrics. |

> **Security model:** dashboards are public by URL unless access control is added. Provider secrets remain on the server; the browser receives only rendered, aggregated dashboard data. Do not place credentials in client configuration or commit local environment files.

## Quick start

The repository pins **Node.js 20** in [`.nvmrc`](./.nvmrc) and **pnpm 10.12.4** in [`package.json`](./package.json). From the repository root, install the workspace and start the dashboard application:

```sh
pnpm install
pnpm --filter @artform/dashboards dev
```

Open [http://localhost:3000](http://localhost:3000) for the client index, then open a configured dashboard path such as [http://localhost:3000/artform](http://localhost:3000/artform). The available paths are the `slug` values in [`app/config/clients.ts`](./app/config/clients.ts).

The application runs in demo mode without credentials. To enable a live provider, copy the environment template, add only the required secrets, configure the source for the relevant client, and restart the app:

```sh
cp app/.env.example app/.env.local
# Edit app/.env.local; do not commit this file.
```

## Repository guide

| Area | Purpose | Start here |
| --- | --- | --- |
| `app/` | Next.js dashboard application, connectors, client registry, reports, and API routes | [`app/README.md`](./app/README.md) |
| `app/config/clients.ts` | Source of truth for client paths, branding, sources, and report scheduling | [Client configuration](./app/config/clients.ts) |
| `app/lib/connectors/` | Connector contract, registry, provider implementations, and demo-data helpers | [`app/CONNECTORS.md`](./app/CONNECTORS.md) |
| `app/lib/report/` | PDF rendering and email-delivery support | [`app/REPORTS.md`](./app/REPORTS.md) |
| `semantic/` | Optional FastAPI, DuckDB, and semantic-model service | [`semantic/README.md`](./semantic/README.md) |
| `core/` | ArtForm-branded Tabler design-system package used by the dashboard | [`core/README.md`](./core/README.md) |
| `docs/` and `preview/` | Upstream design-system documentation and preview projects | Their local README/package configuration |

## Dashboard architecture

```text
Viewer
  │
  ▼
Next.js dashboard route: /<client-slug>
  │  resolves client configuration and date/comparison state
  ▼
Connector registry
  │  fetches configured providers in parallel and normalizes panels
  ├───────────────────────────────► Provider APIs (live mode)
  │
  └───────────────────────────────► Deterministic demo data (demo/fallback mode)
  │
  ▼
Generic dashboard UI
```

A connector emits normalized `stat`, `timeseries`, and `breakdown` panels. This separation means that adding a provider normally requires a connector implementation, registration, and a client source entry—not a new page or rendering system. The complete contract, provider catalogue, authentication requirements, and authoring workflow are documented in [`app/CONNECTORS.md`](./app/CONNECTORS.md).

## Configure a client

Clients are code-configured rather than stored in a database. Add an entry to `clientDefs` in [`app/config/clients.ts`](./app/config/clients.ts), using a lower-case, hyphenated slug. The module validates slugs, colours, required fields, and duplicate slugs at import time, so invalid configuration fails early.

```ts
{
  slug: "example-client",
  name: "Example Client",
  brand: {
    primary: "#426fb6",
    accent: "#e41679",
    logo: "https://cdn.example.com/example-client-logo.svg",
  },
  sources: [
    { type: "ga4", config: { propertyId: "123456789" } },
    { type: "search-console", config: { siteUrl: "https://example.com/" } },
    { type: "stripe", config: { currency: "USD" } },
  ],
  report: {
    recipients: ["reports@example.com"],
    enabled: false,
  },
}
```

The `type` must match a registered connector. The `config` object is provider-specific; connector documentation identifies the required fields. Secrets belong in environment variables, while identifiers such as a GA4 property ID or a Search Console site URL belong in the source configuration.

## Run and deploy

The normal production setup is a Vercel project rooted at `app/`. A single domain hosts every dashboard under its client path, so a new client does not require a wildcard domain or a DNS change. Provider secrets are configured as project environment variables. Follow the complete deployment and troubleshooting runbook in [`app/DEPLOY.md`](./app/DEPLOY.md).

The semantic service is intentionally separate from the Vercel deployment because DuckDB needs a persistent process. Run it on a container platform or VM, protect `POST /query` with its bearer token, and set `SEMANTIC_API_URL` and `SEMANTIC_API_TOKEN` for the dashboard app. See [`semantic/README.md`](./semantic/README.md) and [`semantic/INGESTION.md`](./semantic/INGESTION.md).

## Common commands

| Goal | Command |
| --- | --- |
| Install workspace dependencies | `pnpm install` |
| Run the dashboard in development | `pnpm --filter @artform/dashboards dev` |
| Build the dashboard for production | `pnpm --filter @artform/dashboards build` |
| Start the production dashboard | `pnpm --filter @artform/dashboards start` |
| Run dashboard unit tests | `pnpm --filter @artform/dashboards test` |
| Lint the dashboard | `pnpm --filter @artform/dashboards lint` |
| Run the workspace development tasks | `pnpm dev` |

## Documentation map

The documentation is organized by the job being performed rather than duplicated across files.

| If you need to… | Read |
| --- | --- |
| Understand dashboard behavior, URL state, and the connector model | [`app/README.md`](./app/README.md) |
| Run locally, configure clients, connect credentials, or deploy | [`app/DEPLOY.md`](./app/DEPLOY.md) |
| Choose, configure, or author a data connector | [`app/CONNECTORS.md`](./app/CONNECTORS.md) |
| Generate or schedule PDF/email reports | [`app/REPORTS.md`](./app/REPORTS.md) |
| Run or develop the semantic service | [`semantic/README.md`](./semantic/README.md) |
| Design a historical ingestion process for the semantic service | [`semantic/INGESTION.md`](./semantic/INGESTION.md) |
| Report a security issue | [`SECURITY.md`](./SECURITY.md) |

## License and attribution

ArtForm Tables builds on the Tabler design-system code in this repository. See [`LICENSE`](./LICENSE) for the applicable license terms and [`CONTRIBUTORS.md`](./CONTRIBUTORS.md) for project contributor information.
