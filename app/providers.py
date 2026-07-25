"""Where a participant's key is spent.

Every participant brings their own key, and not everyone brings the same
vendor. TokenRouter exposes leading models behind a Claude-compatible
Messages API, so one streaming implementation covers both a direct Anthropic
key and a TokenRouter key that fronts OpenAI, Gemini, or anything else on the
router -- the room does not have to standardise on one vendor to work
together.
"""

PROVIDERS = {
    "anthropic": {
        "label": "Anthropic",
        "url": "https://api.anthropic.com/v1/messages",
        "default_model": "claude-opus-4-20250514",
        "key_hint": "sk-ant-...",
        "console": "https://console.anthropic.com/settings/keys",
    },
    "tokenrouter": {
        "label": "TokenRouter",
        "url": "https://api.tokenrouter.com/v1/messages",
        "default_model": "claude-opus-4-20250514",
        "key_hint": "tr-...",
        "console": "https://www.tokenrouter.com/console/token",
    },
}

DEFAULT_PROVIDER = "anthropic"


def resolve(provider: str | None) -> dict:
    return PROVIDERS.get(provider or DEFAULT_PROVIDER, PROVIDERS[DEFAULT_PROVIDER])


def endpoint(provider: str | None) -> str:
    return resolve(provider)["url"]


def default_model(provider: str | None) -> str:
    return resolve(provider)["default_model"]


def public_catalog() -> list[dict]:
    """Safe to hand to the browser: labels and consoles, never keys."""
    return [
        {"id": pid, "label": p["label"], "key_hint": p["key_hint"],
         "console": p["console"], "default_model": p["default_model"]}
        for pid, p in PROVIDERS.items()
    ]
