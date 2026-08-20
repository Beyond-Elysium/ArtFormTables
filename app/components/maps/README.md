# Vendored map data

## `us-mill.json` — United States, Miller projection

51 regions (50 states + DC), keyed by ISO 3166-2 codes (`US-VA`, `US-CA`, …).

**Source:** the `@react-jvectormap/unitedstates` npm package (`usMill.json`),
which carries the original jVectorMap map data. **MIT licensed** — see
[`LICENSE.us-map.txt`](./LICENSE.us-map.txt) (© 2015 Rubbby).

**Why vendored rather than a dependency:** the `jsvectormap` package that ships
with `@tabler/core` only bundles *world* maps (`dist/maps/world.js`,
`world-merc.js`) — there is no US map in it. The jVectorMap data above is
format-compatible with jsvectormap (both take `{ insets, paths, height, width,
projection }`), so only one transform was needed: the npm package nests the map
under a `content` key, and that wrapper is stripped here.

The file is ~80 KB, so it is **dynamically imported** by `MapChart` only when a
map panel actually asks for `scope: "us"` — it never enters the main bundle.

Region codes are what a `MapPanel`'s `rows[].code` must match: GA4 reports US
states as names ("Virginia"), so `lib/connectors/geo.ts` maps those to
`US-XX` codes before the panel is built.

### World map

Not vendored — `jsvectormap/dist/maps/world.js` is used directly from the
package, and its region codes are ISO 3166-1 alpha-2 (`US`, `GB`, `DE`), which
is exactly what GA4's `countryId` dimension returns. No mapping needed.
