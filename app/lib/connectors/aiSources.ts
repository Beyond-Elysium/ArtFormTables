/**
 * AI referral detection + an algorithmic "AI Score".
 *
 * "AI traffic" = visits referred by AI assistants / answer engines (ChatGPT,
 * Perplexity, Gemini, Copilot, …). GA4 reports these as the session *source*
 * host, so we match the host by token — `chat.openai.com`, `chatgpt.com` and
 * `openai.com` all resolve to one assistant.
 *
 * The AI Score is a transparent 0–100 composite of five signals we can derive
 * from GA4 alone. It answers "how well is this site doing in the AI ecosystem?"
 * — the GEO/answer-engine question agencies increasingly get asked. Pure and
 * dependency-free so it's unit-testable and easy to tune (see AI_SCORE_TARGETS
 * / AI_SCORE_WEIGHTS).
 */
import "server-only";

interface AiSourceDef {
  id: string;
  label: string;
  match: RegExp;
}

// Ordered: first match wins. Tokens are chosen to catch host variants without
// grabbing the plain search engines (e.g. match Bing *Copilot*, not Bing).
const AI_SOURCES: AiSourceDef[] = [
  { id: "chatgpt", label: "ChatGPT", match: /chatgpt|openai/i },
  { id: "perplexity", label: "Perplexity", match: /perplexity/i },
  { id: "gemini", label: "Gemini", match: /gemini|bard/i },
  { id: "copilot", label: "Copilot", match: /copilot|edgeservices|bingapis/i },
  { id: "claude", label: "Claude", match: /claude\.ai|anthropic/i },
  { id: "grok", label: "Grok", match: /grok|x\.ai/i },
  { id: "deepseek", label: "DeepSeek", match: /deepseek/i },
  { id: "meta-ai", label: "Meta AI", match: /meta\.ai/i },
  { id: "mistral", label: "Le Chat", match: /mistral|lechat/i },
  { id: "you", label: "You.com", match: /(^|\W)you\.com/i },
  { id: "poe", label: "Poe", match: /poe\.com/i },
  { id: "phind", label: "Phind", match: /phind/i },
];

/** Resolve a GA4 session source to a known AI assistant, or null. */
export function matchAiSource(source: string | undefined): { id: string; label: string } | null {
  if (!source) return null;
  for (const a of AI_SOURCES) {
    if (a.match.test(source)) return { id: a.id, label: a.label };
  }
  return null;
}

export function isAiSource(source: string | undefined): boolean {
  return matchAiSource(source) !== null;
}

/* --------------------------------------------------------------------- *
 * AI Score
 * --------------------------------------------------------------------- */

export interface AiSignals {
  /** Sessions referred by any AI assistant in the current period. */
  aiSessions: number;
  /** All sessions in the current period (denominator for share). */
  totalSessions: number;
  /** AI sessions in the previous equal-length period (for momentum). */
  prevAiSessions: number;
  /** Engaged AI sessions in the current period (for engagement quality). */
  aiEngagedSessions: number;
  /** Overall site engagement rate (0..1) to compare AI traffic against. */
  siteEngagementRate: number;
  /** Distinct AI assistants that referred at least one session. */
  distinctSources: number;
  /** Distinct landing pages that received AI referrals. */
  distinctPages: number;
}

export interface AiScoreComponent {
  label: string;
  /** Normalised 0..1 sub-score. */
  value: number;
  /** Weight applied in the composite (weights sum to 1). */
  weight: number;
}

export interface AiScore {
  /** 0..100 composite. */
  score: number;
  grade: string;
  /** AI share of sessions (0..1). */
  share: number;
  /** % change in AI sessions vs the previous period. */
  trendPct: number;
  components: AiScoreComponent[];
}

/** "Full marks" thresholds — tune these as the AI-referral baseline shifts. */
export const AI_SCORE_TARGETS = {
  /** AI share of sessions that earns a full share sub-score (3% is strong today). */
  share: 0.03,
  /** Assistant count that earns full diversity credit. */
  sources: 5,
  /** Distinct AI-referred pages that earns full coverage credit. */
  pages: 20,
};

export const AI_SCORE_WEIGHTS = {
  share: 0.35,
  trend: 0.2,
  engagement: 0.15,
  diversity: 0.15,
  coverage: 0.15,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function gradeFor(score: number): string {
  if (score >= 85) return "A+";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "D";
}

export function computeAiScore(s: AiSignals): AiScore {
  const share = s.totalSessions > 0 ? s.aiSessions / s.totalSessions : 0;
  const trendPct = pctChange(s.aiSessions, s.prevAiSessions);
  const aiEngagement = s.aiSessions > 0 ? s.aiEngagedSessions / s.aiSessions : 0;

  // Each sub-score is normalised to 0..1.
  const cShare = clamp01(share / AI_SCORE_TARGETS.share);
  // Momentum: -100% → 0, flat → 0.5, +100% or better → 1.
  const cTrend = clamp01(0.5 + trendPct / 200);
  // Engagement quality relative to the site: parity → 0.5, 2× site → 1.
  const cEngagement = clamp01((aiEngagement / Math.max(s.siteEngagementRate, 0.01)) * 0.5);
  const cDiversity = clamp01(s.distinctSources / AI_SCORE_TARGETS.sources);
  const cCoverage = clamp01(s.distinctPages / AI_SCORE_TARGETS.pages);

  const w = AI_SCORE_WEIGHTS;
  const composite =
    w.share * cShare +
    w.trend * cTrend +
    w.engagement * cEngagement +
    w.diversity * cDiversity +
    w.coverage * cCoverage;
  const score = Math.round(100 * composite);

  return {
    score,
    grade: gradeFor(score),
    share,
    trendPct,
    components: [
      { label: "AI traffic share", value: cShare, weight: w.share },
      { label: "Momentum", value: cTrend, weight: w.trend },
      { label: "Engagement quality", value: cEngagement, weight: w.engagement },
      { label: "Assistant diversity", value: cDiversity, weight: w.diversity },
      { label: "Page coverage", value: cCoverage, weight: w.coverage },
    ],
  };
}
