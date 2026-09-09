import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { clientsSchema } from "./clients";

/**
 * Generates `clients.schema.json` — the JSON Schema that gives editors
 * autocomplete, hover help and inline validation while editing
 * `clients.json`.
 *
 * It's a test rather than a script so the generated file can't silently drift
 * from the zod schema it's derived from: change a field in `clients.ts` and
 * this fails until the schema is regenerated with `pnpm schema`.
 *
 * The zod schema stays the single authority on what's valid — this is a
 * projection of it for the editor, never a second source of truth.
 */

/**
 * Every registered connector type, read from the connector files rather than
 * imported. `lib/connectors/index.ts` imports the client registry, so
 * importing it back here would be a cycle; parsing the files keeps the enum
 * accurate without one.
 */
function connectorTypes(): string[] {
  const dir = join(__dirname, "..", "lib", "connectors");
  const types = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file === "TEMPLATE.ts") continue;
    const m = readFileSync(join(dir, file), "utf8").match(/^\s{2}type:\s*"([a-z0-9-]+)"/m);
    if (m) types.add(m[1]);
  }
  return [...types].sort();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSchema(): any {
  // `io: "input"` describes the file as authored — fields with defaults stay
  // optional, which is what an editor should accept.
  const schema = z.toJSONSchema(clientsSchema, { io: "input" });

  // Constrain `type` to the connectors that actually exist, so the editor
  // offers them as a dropdown and flags a typo immediately. Done here rather
  // than in the zod schema itself to avoid the import cycle above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defs = (schema as any).$defs ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.properties?.type && node.properties?.config) {
      node.properties.type = { ...node.properties.type, enum: connectorTypes() };
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(schema);
  walk(defs);

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "ArtForm client registry",
    description:
      "Which client dashboards exist and what data feeds them. Generated from config/clients.ts — edit the zod schema there, then run `pnpm schema`.",
    ...schema,
  };
}

describe("clients.schema.json", () => {
  it("matches the zod schema (run `pnpm schema` if this fails)", async () => {
    await expect(JSON.stringify(buildSchema(), null, 2) + "\n").toMatchFileSnapshot(
      "./clients.schema.json",
    );
  });

  it("offers every registered connector as an allowed source type", () => {
    const types = connectorTypes();
    expect(types).toContain("ga4");
    expect(types).toContain("pagespeed");
    expect(types).toContain("microsoft-ads");
    // Every type used in the registry must be a real connector.
    const used = new Set(
      (JSON.parse(readFileSync(join(__dirname, "clients.json"), "utf8")) as {
        sources: { type: string }[];
      }[]).flatMap((c) => c.sources.map((s) => s.type)),
    );
    for (const t of used) expect(types).toContain(t);
  });
});
