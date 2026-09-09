# Editing the client registry

Which dashboards exist and what data feeds them lives in
**`config/clients.json`**. `config/clients.ts` holds the rules for what a valid
entry looks like; it's the only place that decides what's allowed.

Open `clients.json` in VS Code and you get:

- **Autocomplete** on every field (`Ctrl+Space`)
- **A dropdown of all 38 connector types** when you type `"type":`
- **Hover help** explaining what each field does
- **Red squiggles the moment something's wrong** — before you commit, let alone deploy

That's wired up by `.vscode/settings.json`, which points the file at
`clients.schema.json`. No setup needed; it just works when you open the repo.

## Common edits

### Change a client's colours

```jsonc
{
  "slug": "maximus",
  "brand": { "primary": "#333333", "accent": "#e41679" }
}
```

Must be `#rrggbb`. Anything else gets flagged as you type.

### Add a data source

Add an entry to that client's `sources`:

```jsonc
{ "type": "ga4", "config": { "propertyId": "302350399" } }
```

The `type` decides what goes in `config`:

| Type | `config` keys |
| --- | --- |
| `ga4` | `propertyId` · optional `pagePathPrefix`, `pageTitleContains`, `geoScope` (`world`/`us`/`none`), `aiInsights` |
| `search-console`, `bing-webmaster` | `siteUrl` |
| `google-ads` | `customerId`, `currency` · optional `campaignNameFilter`, `hideSpend` |
| `linkedin-ads` | `accountId`, `currency` · optional `campaignIds`, `hideSpend` |
| `microsoft-ads` | `accountId`, `currency` · optional `customerId`, `campaignFilter`, `hideSpend` |
| `pagespeed` | `url` · optional `strategy` (`mobile`/`desktop`) |
| `nocodb` | `tableId` · optional `baseUrl`, `dateField` |
| `hubspot` | `tokenEnv` — the *name* of the env var holding that portal's token |
| `mailchimp`, and most others | `{}` — the API key alone is enough |

Anything not listed still works: hover `config` in the editor for the full
list, or check the connector's own file in `lib/connectors/`.

### Add a named tab

```jsonc
"views": [
  { "name": "Census", "group": "Programs", "sourceIds": ["ga4-census"] }
]
```

`sourceIds` must match a source's `id`. Give the source an explicit `id` if a
view references it — without one it gets a positional id (`ga4-3`) that
shifts if you reorder the list.

Views sharing a `group` collapse into one dropdown tab instead of taking a
top-level tab each.

### Add a whole client

Copy an existing entry, change `slug`, `name`, `brand` and `sources`. The
`slug` is the URL — `"acme"` serves `/acme`.

## When you get it wrong

Nothing breaks in front of a client. A bad entry stops the build with a
message naming the exact spot:

```
config/clients.json is invalid (1 problem):
  • clients[3] (maximus) → brand → primary: must be a #rrggbb hex colour
```

The same check runs in the editor, in `pnpm test`, in `pnpm build` and in
`next dev` — so a mistake surfaces long before it reaches a deploy.

## Things worth knowing

1. **`slug` is the public URL.** Renaming one breaks every existing link to
   that dashboard. Treat it as permanent.
2. **Placeholder ids deliberately show demo data.** An all-zero account id
   (`000-000-0000`) or a `5000000xx` LinkedIn id is read as "not connected
   yet" — the dashboard shows sample numbers rather than erroring. The
   `notes` field flags every one of these.
3. **`notes` is internal.** It never renders to a viewer. Use it for what's
   still a placeholder or blocked on a credential.
4. **Credentials never go in here.** This file is committed. Tokens and keys
   live in environment variables — see `.env.example`. `hubspot`'s `tokenEnv`
   holds the *name* of a variable, never its value.

## If you change `clients.ts`

The editor schema is generated from it. After changing a field or rule:

```sh
pnpm schema
```

`pnpm test` fails if you forget — the generated schema is checked against the
zod source, so the two can't drift apart.
