"""011-token-cost — deterministic pricing (AC1). No OpenAI key needed."""

from app.llm.pricing import cost_usd, usage_metrics
from app.llm.provider import TokenUsage


def test_cost_usd_is_the_price_table_dot_product():
    # gpt-4o-mini: input $0.15 / 1M, output $0.60 / 1M.
    assert cost_usd("gpt-4o-mini", 1_000_000, 0) == 0.15
    assert cost_usd("gpt-4o-mini", 0, 1_000_000) == 0.60
    assert cost_usd("gpt-4o-mini", 1_000_000, 1_000_000) == 0.75


def test_unknown_model_prices_at_zero():
    assert cost_usd("some-unlisted-model", 1_000_000, 1_000_000) == 0.0


def test_no_tokens_costs_nothing():
    assert cost_usd("gpt-4o-mini", 0, 0) == 0.0


def test_usage_metrics_shape():
    m = usage_metrics(
        "gpt-4o-mini", TokenUsage(prompt_tokens=1000, completion_tokens=500, total_tokens=1500)
    )
    assert m["prompt_tokens"] == 1000.0
    assert m["completion_tokens"] == 500.0
    assert m["total_tokens"] == 1500.0
    # 1000/1e6*0.15 + 500/1e6*0.60 = 0.00015 + 0.0003 = 0.00045
    assert abs(m["cost_usd"] - 0.00045) < 1e-9
    assert all(isinstance(v, float) for v in m.values())


def test_vertexai_gemini_models_have_prices():
    """094-vertex-ai — Gemini model ids resolve to non-zero prices."""
    for model in (
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-3-flash-preview",
        "gemini-3.5-flash",
        "gemini-3.1-pro-preview",
    ):
        assert cost_usd(model, 1_000_000, 0) > 0, f"{model} input should be priced"
        assert cost_usd(model, 0, 1_000_000) > 0, f"{model} output should be priced"


# --- 099-prompt-caching -------------------------------------------------------


def test_from_metadata_reads_cached_tokens():
    """AC1 — cache_read from input_token_details lands on TokenUsage.cached_tokens."""
    md = {
        "input_tokens": 1000,
        "output_tokens": 500,
        "total_tokens": 1500,
        "input_token_details": {"cache_read": 768, "audio": 0},
    }
    usage = TokenUsage.from_metadata(md)
    assert usage is not None
    assert usage.cached_tokens == 768


def test_from_metadata_cached_tokens_defaults_to_zero():
    """AC1 — no input_token_details (or no cache_read) ⇒ 0, back-compat."""
    assert (
        TokenUsage.from_metadata(
            {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}
        ).cached_tokens
        == 0
    )
    assert (
        TokenUsage.from_metadata(
            {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15, "input_token_details": {}}
        ).cached_tokens
        == 0
    )
    # Default on the dataclass itself (011 call sites that never set it).
    assert TokenUsage(prompt_tokens=1, completion_tokens=1, total_tokens=2).cached_tokens == 0


def test_cost_usd_bills_cached_tokens_at_discount():
    """AC2 — cached portion billed at the cached rate, not the full input rate."""
    # gpt-4.1-mini: input $0.40 / 1M, cached $0.10 / 1M, output $1.60 / 1M.
    # 1M prompt tokens, 250k of them cached, no completion:
    #   (1_000_000 - 250_000)/1e6 * 0.40 + 250_000/1e6 * 0.10 = 0.30 + 0.025 = 0.325
    got = cost_usd("gpt-4.1-mini", 1_000_000, 0, cached_tokens=250_000)
    assert abs(got - 0.325) < 1e-9
    # With no cached tokens it matches the plain full-price call (back-compat).
    assert cost_usd("gpt-4.1-mini", 1_000_000, 0) == cost_usd(
        "gpt-4.1-mini", 1_000_000, 0, cached_tokens=0
    )


def test_cost_usd_default_keeps_011_signature():
    """AC2 — the 011 two-arg call still works and is unchanged."""
    assert cost_usd("gpt-4o-mini", 1_000_000, 1_000_000) == 0.75


def test_cost_usd_unlisted_cached_rate_falls_back_to_full():
    """AC2 — a model with no cached rate bills cached tokens at the full input rate."""
    # gemini-2.5-flash has an input price but (deliberately) no cached rate ⇒ no discount.
    full = cost_usd("gemini-2.5-flash", 1_000_000, 0)
    cached = cost_usd("gemini-2.5-flash", 1_000_000, 0, cached_tokens=500_000)
    assert cached == full  # no crash, no discount


def test_usage_metrics_includes_cached_keys():
    """AC3 — metrics carry cached_tokens + cost_saved_usd (floats), discounted cost."""
    usage = TokenUsage(
        prompt_tokens=1_000_000, completion_tokens=0, total_tokens=1_000_000, cached_tokens=250_000
    )
    m = usage_metrics("gpt-4.1-mini", usage)
    assert m["cached_tokens"] == 250_000.0
    # saved = cached * (full - cached rate) = 250_000/1e6 * (0.40 - 0.10) = 0.075
    assert abs(m["cost_saved_usd"] - 0.075) < 1e-9
    # cost_usd is the discounted (true) cost.
    assert abs(m["cost_usd"] - 0.325) < 1e-9
    assert all(isinstance(v, float) for v in m.values())


def test_usage_metrics_zero_cached_is_zero_not_missing():
    """AC3 — keys always present; 0.0 when nothing was cached."""
    m = usage_metrics(
        "gpt-4o-mini", TokenUsage(prompt_tokens=1000, completion_tokens=500, total_tokens=1500)
    )
    assert m["cached_tokens"] == 0.0
    assert m["cost_saved_usd"] == 0.0
