import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request


RAE_2010_UNACCENTED_MONOSYLLABLES = {
    "guion",
    "truhan",
    "fie",
    "fiais",
    "fieis",
    "liais",
    "lieis",
    "rio",
    "riais",
    "rieis",
    "crie",
    "crio",
    "criais",
    "crieis",
}

RAE_CONFIRMED_ACCENT_REPLACEMENTS = {
    "ortografia": "ortografía",
    "ortografico": "ortográfico",
    "ortografica": "ortográfica",
    "pagina": "página",
    "paginas": "páginas",
    "tambien": "también",
    "parrafo": "párrafo",
    "parrafos": "párrafos",
    "puntuacion": "puntuación",
    "acentuacion": "acentuación",
}

RAE_CONFIRMED_VALID_WORDS = {
    "solito",
    "solita",
    "solitos",
    "solitas",
}

_LOOKUP_CACHE = {}


def strip_accents(text):
    raw = str(text or "")
    if not raw:
        return ""
    normalized = unicodedata.normalize("NFD", raw)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def compact_word(value=""):
    return re.sub(r"[^a-záéíóúüñ]", "", str(value or "").strip().lower())


def is_rae_normative_blocked(token="", suggestion=""):
    token_key = strip_accents(compact_word(token))
    suggestion_key = strip_accents(compact_word(suggestion))
    if token_key and token_key == suggestion_key and token_key in RAE_2010_UNACCENTED_MONOSYLLABLES:
        return True
    return False


def resolve_local_rae_status(word=""):
    clean = compact_word(word)
    if not clean:
        return "unknown"
    if clean in RAE_CONFIRMED_VALID_WORDS:
        return "valid"
    accentless = strip_accents(clean)
    if accentless in RAE_2010_UNACCENTED_MONOSYLLABLES:
        return "valid" if clean == accentless else "invalid"
    if clean in RAE_CONFIRMED_ACCENT_REPLACEMENTS.values():
        return "valid"
    if clean in RAE_CONFIRMED_ACCENT_REPLACEMENTS:
        return "invalid"
    return "unknown"


def _read_bool_env(name, default=False):
    raw = str(os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on", "si", "sí"}


def _read_float_env(name, default):
    raw = str(os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _extract_rae_api_validity(payload):
    if not isinstance(payload, dict):
        return "unknown"
    if payload.get("ok") is False or payload.get("error"):
        return "invalid"
    candidates = []
    for key in ("data", "results", "articles", "meanings", "definitions"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend(value)
        elif isinstance(value, dict):
            candidates.append(value)
    if candidates:
        return "valid"
    if payload.get("word") or payload.get("title") or payload.get("definitions"):
        return "valid"
    return "unknown"


def query_rae_api_word(word="", timeout_sec=None):
    clean = compact_word(word)
    if not clean:
        return "unknown"
    cache_key = ("rae-api", clean)
    now = time.monotonic()
    cached = _LOOKUP_CACHE.get(cache_key)
    if cached and now - cached.get("at", 0) < 3600:
        return cached.get("status") or "unknown"

    timeout = timeout_sec if timeout_sec is not None else _read_float_env("ANALIZAR_IDML_RAE_TIMEOUT_SEC", 1.2)
    api_key = str(os.getenv("RAE_API_KEY") or os.getenv("ANALIZAR_IDML_RAE_API_KEY") or "").strip()
    url = f"https://rae-api.com/api/words/{urllib.parse.quote(clean)}"
    headers = {
        "Accept": "application/json",
        "User-Agent": "CharlyBrown-AnalizarIDML/1.0",
    }
    if api_key:
        headers["X-API-Key"] = api_key
    try:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        status = _extract_rae_api_validity(payload)
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
        TimeoutError,
        json.JSONDecodeError,
        ValueError,
    ):
        status = "unknown"
    _LOOKUP_CACHE[cache_key] = {"status": status, "at": now}
    return status


def lookup_rae_word(word="", allow_network=None):
    local_status = resolve_local_rae_status(word)
    if local_status != "unknown":
        return local_status
    network_enabled = _read_bool_env("ANALIZAR_IDML_RAE_VALIDATE_ONLINE", False) if allow_network is None else bool(allow_network)
    if not network_enabled:
        return "unknown"
    return query_rae_api_word(word)


def validate_spelling_candidate_with_rae(token="", suggestion="", allow_network=None):
    if is_rae_normative_blocked(token, suggestion):
        return False
    token_key = compact_word(token)
    suggestion_key = compact_word(suggestion)
    if not token_key or not suggestion_key:
        return False
    confirmed = RAE_CONFIRMED_ACCENT_REPLACEMENTS.get(strip_accents(token_key))
    if confirmed and suggestion_key == confirmed:
        return True

    token_status = lookup_rae_word(token_key, allow_network=allow_network)
    suggestion_status = lookup_rae_word(suggestion_key, allow_network=allow_network)
    if token_status == "valid":
        return False
    if token_status == "invalid" and suggestion_status == "valid":
        return True

    strict = _read_bool_env("ANALIZAR_IDML_REQUIRE_RAE_VALIDATION", False)
    if strict:
        return False
    return suggestion_status != "invalid"
