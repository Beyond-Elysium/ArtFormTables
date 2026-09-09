import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClientBySlug } from "@/config/clients";
import { runSemanticQuery, semanticConfigured, semanticModels } from "@/lib/semantic";
import { forceClientFilter } from "@/lib/explore";
import {
  buildNlqSchema,
  buildSystemPrompt,
  explainQuery,
  extractJson,
  toSemanticQuery,
  type NlqQuery,
} from "./translate";

// NLQ ("ask your dashboard", finding E4) — fully server-side, Path A: the
// viewer types a question; Claude translates it into a semantic-layer query
// against the /models schemas; we validate STRICTLY (unknown models/fields are
// rejected — the LLM output is never trusted), force the client scope exactly
// like /api/semantic (chunk 22), execute, and return the query + rows. The
// Anthropic key never leaves the server.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NLQ_MODEL = "claude-sonnet-5";
const MAX_QUESTION_CHARS = 500;

function nlqConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && semanticConfigured();
}

/** Lightweight probe for the UI: is the Ask box worth showing? */
export async function GET() {
  return NextResponse.json({ configured: nlqConfigured() });
}

export async function POST(req: NextRequest) {
  if (!nlqConfigured()) {
    return NextResponse.json({ error: "NLQ is not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as
    | { client?: unknown; question?: unknown }
    | null;
  if (typeof body?.client !== "string" || !body.client) {
    return NextResponse.json({ error: "client is required" }, { status: 400 });
  }
  const client = getClientBySlug(body.client);
  if (!client) {
    return NextResponse.json({ error: `unknown client '${body.client}'` }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json(
      { error: `question too long (max ${MAX_QUESTION_CHARS} characters)` },
      { status: 400 },
    );
  }

  // Live schemas drive both the prompt and the validation, so Claude can only
  // reference models/fields that actually exist right now.
  const schemas = await semanticModels();
  if (!schemas || Object.keys(schemas).length === 0) {
    return NextResponse.json({ error: "semantic schema unavailable" }, { status: 502 });
  }

  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
  const today = new Date().toISOString().slice(0, 10);
  let text = "";
  try {
    const msg = await anthropic.messages.create({
      model: NLQ_MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" }, // fast structured translation — no reasoning pass
      system: buildSystemPrompt(schemas, today),
      messages: [{ role: "user", content: question }],
    });
    text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (err) {
    console.error("[nlq] Claude call failed:", err);
    return NextResponse.json({ error: "translation service failed" }, { status: 502 });
  }

  const json = extractJson(text);
  if (!json) {
    return NextResponse.json(
      { error: "could not translate the question into a query" },
      { status: 422 },
    );
  }
  if ((json as { model?: unknown }).model === "__unanswerable__") {
    return NextResponse.json(
      { error: "that question can't be answered from the available data" },
      { status: 422 },
    );
  }

  const parsed = buildNlqSchema(schemas).safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "generated query failed validation",
        detail: parsed.error.issues.map((i) => i.message).slice(0, 5),
      },
      { status: 422 },
    );
  }

  // Force the client scope exactly like /api/semantic (chunk 22). This is the
  // query we show the user; runSemanticQuery re-forces it defensively too.
  const query = forceClientFilter(toSemanticQuery(parsed.data as NlqQuery), client.slug);
  const outcome = await runSemanticQuery(query, client.slug);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.message ?? "query failed", query },
      { status: outcome.status >= 400 && outcome.status < 600 ? outcome.status : 502 },
    );
  }

  return NextResponse.json({
    query,
    result: outcome.result,
    explanation: explainQuery(query),
  });
}
