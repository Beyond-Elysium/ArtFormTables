/**
 * NLQ translation layer (Chunk 26 / finding E4) — pure, unit-tested logic for
 * turning a Claude response into a validated, client-scoped SemanticQuery.
 *
 * The route (route.ts) does the I/O: fetch /models, call Claude, execute. This
 * module owns everything deterministic: the system prompt, JSON extraction,
 * strict zod validation against the live model schemas (unknown models/fields
 * are rejected — Claude's output is never trusted), and the mapping into the
 * SemanticQuery shape whose client filter is then forced exactly like every
 * other query (lib/explore.ts forceClientFilter + runSemanticQuery).
 */
import { z } from "zod";
import type { SemanticModelSchema, SemanticQuery } from "@/lib/semantic";
import { modelLabel, fieldLabel } from "@/lib/semanticLabels";

export type NlqSchemas = Record<string, SemanticModelSchema>;

const OPS = ["=", "!=", ">", ">=", "<", "<=", "in"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const scalar = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Strict zod schema for the JSON Claude must return, bound to the live model
 * schemas: the model must exist, and every dimension/measure/filter/order
 * field must belong to that model. Unknown object keys are rejected.
 */
export function buildNlqSchema(schemas: NlqSchemas) {
  const modelNames = Object.keys(schemas);
  if (modelNames.length === 0) {
    // The route guards this; nothing could validate against an empty catalogue.
    throw new Error("no semantic models available");
  }
  return z
    .object({
      model: z.enum(modelNames as [string, ...string[]]),
      dimensions: z.array(z.string()).default([]),
      measures: z.array(z.string()).default([]),
      filters: z
        .array(
          z
            .object({
              field: z.string().min(1),
              op: z.enum(OPS).default("="),
              value: z.union([scalar, z.array(scalar)]),
            })
            .strict(),
        )
        .default([]),
      time_range: z
        .object({
          start: z.string().regex(ISO_DATE, "start must be YYYY-MM-DD").optional(),
          end: z.string().regex(ISO_DATE, "end must be YYYY-MM-DD").optional(),
        })
        .strict()
        .nullable()
        .default(null),
      order_by: z
        .array(z.tuple([z.string(), z.enum(["asc", "desc"])]))
        .nullable()
        .default(null),
      limit: z.number().int().min(1).max(500).nullable().default(null),
    })
    .strict()
    .superRefine((q, ctx) => {
      const schema = schemas[q.model];
      if (!schema) return; // enum already rejected it
      const dims = new Set(schema.dimensions);
      const measures = new Set(schema.measures);
      const fields = new Set([...schema.dimensions, ...schema.measures]);
      for (const d of q.dimensions) {
        if (!dims.has(d)) {
          ctx.addIssue({ code: "custom", message: `unknown dimension '${d}' on model '${q.model}'` });
        }
      }
      for (const m of q.measures) {
        if (!measures.has(m)) {
          ctx.addIssue({ code: "custom", message: `unknown measure '${m}' on model '${q.model}'` });
        }
      }
      for (const f of q.filters) {
        if (!fields.has(f.field)) {
          ctx.addIssue({ code: "custom", message: `unknown filter field '${f.field}' on model '${q.model}'` });
        }
      }
      for (const [field] of q.order_by ?? []) {
        if (!fields.has(field)) {
          ctx.addIssue({ code: "custom", message: `unknown order_by field '${field}' on model '${q.model}'` });
        }
      }
      if (q.measures.length === 0 && q.dimensions.length === 0) {
        ctx.addIssue({ code: "custom", message: "query selects no dimensions and no measures" });
      }
    });
}

export type NlqQuery = z.infer<ReturnType<typeof buildNlqSchema>>;

/** Map the validated NLQ JSON (wire shape) into the app's SemanticQuery. */
export function toSemanticQuery(q: NlqQuery): SemanticQuery {
  return {
    model: q.model as string,
    dimensions: q.dimensions,
    measures: q.measures,
    filters: q.filters.map((f) => ({ field: f.field, op: f.op, value: f.value })),
    timeRange: q.time_range
      ? { start: q.time_range.start, end: q.time_range.end }
      : undefined,
    orderBy: q.order_by ?? undefined,
    limit: q.limit ?? 500,
  };
}

/**
 * Pull the JSON object out of Claude's reply. The prompt demands bare JSON,
 * but tolerate code fences / stray prose defensively. Null when unparsable.
 */
export function extractJson(text: string): unknown | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return null;
}

/**
 * System prompt embedding the live schemas. `today` (YYYY-MM-DD) anchors
 * relative ranges like "last 90 days".
 */
export function buildSystemPrompt(schemas: NlqSchemas, today: string): string {
  const catalogue = Object.entries(schemas)
    .map(
      ([name, s]) =>
        `- model "${name}": dimensions [${s.dimensions.join(", ")}], measures [${s.measures.join(", ")}], time dimension: ${s.time_dimension ?? "none"}`,
    )
    .join("\n");
  return [
    "You translate an analytics question into ONE query against a semantic layer.",
    "",
    "Available models (use ONLY these models and ONLY their listed fields):",
    catalogue,
    "",
    `Today's date is ${today}. Resolve relative ranges (\"last 90 days\", \"this month\") into absolute YYYY-MM-DD dates.`,
    "",
    "Respond with ONLY a JSON object — no prose, no code fences — of this exact shape:",
    '{"model": string, "dimensions": string[], "measures": string[], "filters": [{"field": string, "op": "="|"!="|">"|">="|"<"|"<="|"in", "value": string|number|boolean|array}], "time_range": {"start"?: "YYYY-MM-DD", "end"?: "YYYY-MM-DD"} | null, "order_by": [[field, "asc"|"desc"]] | null, "limit": number | null}',
    "",
    "Rules:",
    "- Pick the single best model for the question.",
    "- Group by the model's time dimension for trend/over-time questions; order it ascending.",
    "- For top/ranking questions, order by the main measure descending and set a sensible limit (e.g. 10).",
    "- Never add a filter on the 'client' field — scoping is handled server-side.",
    "- If the question cannot be answered from these models, return {\"model\": \"__unanswerable__\"}.",
  ].join("\n");
}

/** Deterministic one-line explanation of the executed query (no extra LLM call). */
export function explainQuery(q: SemanticQuery): string {
  const parts: string[] = [];
  const measures = (q.measures ?? []).map(fieldLabel).join(", ");
  const dims = (q.dimensions ?? []).map(fieldLabel).join(", ");
  parts.push(
    `Queried ${modelLabel(q.model)}${measures ? ` for ${measures}` : ""}${dims ? ` by ${dims}` : ""}`,
  );
  const shown = (q.filters ?? []).filter((f) => f.field !== "client");
  if (shown.length) {
    parts.push(
      `where ${shown.map((f) => `${fieldLabel(f.field)} ${f.op ?? "="} ${JSON.stringify(f.value)}`).join(" and ")}`,
    );
  }
  if (q.timeRange?.start || q.timeRange?.end) {
    parts.push(`from ${q.timeRange?.start ?? "the beginning"} to ${q.timeRange?.end ?? "today"}`);
  }
  return parts.join(", ") + ".";
}
