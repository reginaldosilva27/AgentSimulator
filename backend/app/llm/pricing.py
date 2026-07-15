"""011-token-cost — model pricing.

A small, explicit table of provider list prices (US$ per 1M tokens, input/output)
for OpenAI and Google Vertex AI (Gemini) models. It is a **labelled teaching
approximation**, not a billing source of truth — list prices drift, so the goal is
to make the *shape* of cost visible (rounds × tokens × rate), not to be
invoice-accurate. An unlisted model prices at 0 rather than guessing.
"""

from __future__ import annotations

from .provider import TokenUsage

# USD per 1,000,000 tokens: (input, output). Public list prices (2025-2026).
# A **labelled teaching approximation** — see module docstring.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    # --- OpenAI ---
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    # --- Vertex AI / Gemini ---
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-3-flash-preview": (0.50, 3.00),
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.1-pro-preview": (2.00, 12.00),
}

# 099-prompt-caching — USD per 1,000,000 **cached** input tokens. OpenAI bills the cached
# slice of the prompt at a discount (~50% off for the 4o family, ~75% off for the 4.1
# family); a model absent here bills cached tokens at its full input rate (no discount,
# no crash). Same **labelled teaching approximation** caveat as MODEL_PRICES.
CACHED_INPUT_PRICES: dict[str, float] = {
    "gpt-4o-mini": 0.075,
    "gpt-4o": 1.25,
    "gpt-4.1": 0.50,
    "gpt-4.1-mini": 0.10,
    "gpt-4.1-nano": 0.025,
}


def cost_usd(
    model: str, prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0
) -> float:
    """Cost of a call in US$ from the price table; unknown model ⇒ 0.0.

    099-prompt-caching: ``cached_tokens`` of ``prompt_tokens`` are billed at the model's
    cached input rate (``CACHED_INPUT_PRICES``, defaulting to the full input rate when the
    model isn't listed), the rest at the full input rate — never double-counted.
    """
    input_rate, output_rate = MODEL_PRICES.get(model, (0.0, 0.0))
    cached = max(0, min(cached_tokens, prompt_tokens))
    cached_rate = CACHED_INPUT_PRICES.get(model, input_rate)
    fresh = prompt_tokens - cached
    cost = (
        fresh / 1_000_000 * input_rate
        + cached / 1_000_000 * cached_rate
        + completion_tokens / 1_000_000 * output_rate
    )
    return round(cost, 6)


def cost_saved_usd(model: str, cached_tokens: int) -> float:
    """US$ saved by the cache vs. billing those tokens at the full input rate (099)."""
    input_rate, _ = MODEL_PRICES.get(model, (0.0, 0.0))
    cached_rate = CACHED_INPUT_PRICES.get(model, input_rate)
    saved = max(0, cached_tokens) / 1_000_000 * (input_rate - cached_rate)
    return round(saved, 6)


def usage_metrics(model: str, usage: TokenUsage) -> dict[str, float]:
    """Trace ``metrics`` for one LLM call: tokens + priced cost (all floats).

    099-prompt-caching adds ``cached_tokens`` and ``cost_saved_usd`` (both 0.0 when
    nothing was cached); ``cost_usd`` is the true, cache-discounted cost.
    """
    return {
        "prompt_tokens": float(usage.prompt_tokens),
        "completion_tokens": float(usage.completion_tokens),
        "total_tokens": float(usage.total_tokens),
        "cached_tokens": float(usage.cached_tokens),
        "cost_usd": cost_usd(
            model, usage.prompt_tokens, usage.completion_tokens, usage.cached_tokens
        ),
        "cost_saved_usd": cost_saved_usd(model, usage.cached_tokens),
    }
