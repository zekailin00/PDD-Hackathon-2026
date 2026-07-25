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
        "catalog_url": "https://api.anthropic.com/v1/models",
        "default_model": "claude-opus-4-20250514",
        "key_hint": "sk-ant-...",
        "console": "https://console.anthropic.com/settings/keys",
    },
    "tokenrouter": {
        "label": "TokenRouter",
        "url": "https://api.tokenrouter.com/v1/messages",
        "catalog_url": "https://api.tokenrouter.com/v1/models",
        # Only a fallback. Normally pdd.model_router picks from the live
        # catalog, so nobody in the room has to know a model name.
        "default_model": "anthropic/claude-sonnet-5",
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


def catalog_url(provider: str | None) -> str | None:
    return resolve(provider).get("catalog_url")


_catalog_cache: dict[str, list] = {}


async def fetch_catalog(client, provider: str, api_key: str) -> list:
    """The models this key can actually reach. Cached per provider per process.

    Returns [] on any failure -- a router that cannot see the catalog falls
    back to the provider default rather than failing the run.
    """
    if provider in _catalog_cache:
        return _catalog_cache[provider]
    url = catalog_url(provider)
    if not url:
        return []
    try:
        # Bearer only, deliberately. Adding anthropic-version makes TokenRouter
        # answer in the Anthropic listing shape, which omits
        # supported_endpoint_types -- and without that field every model looks
        # ineligible.
        r = await client.get(url, headers={
            "authorization": f"Bearer {api_key}",
        }, timeout=15.0)
        r.raise_for_status()
        data = r.json().get("data", [])
    except Exception:                            # noqa: BLE001 - never fatal
        return []
    _catalog_cache[provider] = data
    return data


def auto_select(catalog: list, provider: str, difficulty: str = "standard",
                prefer: str | None = None) -> tuple[str, str]:
    """(model, reason), decided by the PDD-owned routing policy."""
    fallback = default_model(provider)
    if not catalog:
        return fallback, "catalog unavailable; using the provider default"
    try:
        from pdd.model_router import NoEligibleModel, choose
    except ImportError:
        return fallback, "router not generated yet; using the provider default"
    try:
        picked = choose(catalog, difficulty=difficulty, prefer=prefer)
    except NoEligibleModel:
        return fallback, "nothing in the catalog speaks this API; using the default"
    return picked["model"], picked["reason"]


def public_catalog() -> list[dict]:
    """Safe to hand to the browser: labels and consoles, never keys."""
    return [
        {"id": pid, "label": p["label"], "key_hint": p["key_hint"],
         "console": p["console"], "default_model": p["default_model"]}
        for pid, p in PROVIDERS.items()
    ]
