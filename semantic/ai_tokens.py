"""
AI referral-source detection for the Python extractors.

!! KEEP IN SYNC with app/lib/connectors/aiSources.ts (AI_SOURCES). !!
The Next app owns this list; it is duplicated here because the extractors can't
import TypeScript. When an assistant is added/removed or a token changes there,
mirror the change here (ids, labels, tokens, and ORDER — first match wins).

"AI traffic" = GA4 sessions whose session *source* host matches an AI
assistant / answer engine (ChatGPT, Perplexity, Gemini, Copilot, …). Matching
is case-insensitive literal substring, first match wins — same semantics as the
app's compiled regex of escaped literals. Tokens are chosen to catch host
variants without grabbing the plain search engines (match Bing *Copilot*, not
Bing).
"""

from __future__ import annotations

# (id, label, tokens) — mirrors aiSources.ts AI_SOURCES, in the same order.
AI_SOURCES: list[tuple[str, str, list[str]]] = [
    ("chatgpt", "ChatGPT", ["chatgpt", "openai"]),
    ("perplexity", "Perplexity", ["perplexity"]),
    ("gemini", "Gemini", ["gemini", "bard"]),
    ("copilot", "Copilot", ["copilot", "edgeservices", "bingapis"]),
    ("claude", "Claude", ["claude.ai", "anthropic"]),
    ("grok", "Grok", ["grok", "x.ai"]),
    ("deepseek", "DeepSeek", ["deepseek"]),
    ("meta-ai", "Meta AI", ["meta.ai"]),
    ("mistral", "Le Chat", ["mistral", "lechat"]),
    ("you", "You.com", ["you.com"]),
    ("poe", "Poe", ["poe.com"]),
    ("phind", "Phind", ["phind"]),
]

#: Every host substring across all assistants — used to build the GA4
#: server-side dimension filter so low-volume AI rows aren't truncated by a row
#: cap before we can count them (mirrors aiSources.ts AI_SOURCE_TOKENS).
AI_SOURCE_TOKENS: list[str] = [t for _, _, tokens in AI_SOURCES for t in tokens]


def match_ai_source(source: str | None) -> tuple[str, str] | None:
    """Resolve a GA4 session source to (id, label) of a known assistant, or None."""
    if not source:
        return None
    s = source.lower()
    for source_id, label, tokens in AI_SOURCES:
        if any(tok in s for tok in tokens):
            return (source_id, label)
    return None


def is_ai_source(source: str | None) -> bool:
    return match_ai_source(source) is not None
