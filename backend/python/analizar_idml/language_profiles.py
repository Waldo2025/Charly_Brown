import re


LANGUAGE_PROFILES = {
    "es-MX": {"dictionaries": ["es_MX", "es", "es_ES"], "name": "español de México", "normative": "RAE"},
    "en-US": {"dictionaries": ["en_US", "en"], "name": "inglés de Estados Unidos", "normative": "dictionary"},
    "fr-FR": {"dictionaries": ["fr_FR", "fr"], "name": "francés de Francia", "normative": "dictionary"},
    "pt-BR": {"dictionaries": ["pt_BR", "pt"], "name": "portugués de Brasil", "normative": "dictionary"},
    "de-DE": {"dictionaries": ["de_DE", "de"], "name": "alemán de Alemania", "normative": "dictionary"},
    "it-IT": {"dictionaries": ["it_IT", "it"], "name": "italiano de Italia", "normative": "dictionary"},
    "ca-ES": {"dictionaries": ["ca_ES", "ca"], "name": "catalán", "normative": "dictionary"},
}

_STOPWORDS = {
    "es-MX": {"el", "la", "los", "las", "de", "que", "para", "con", "una", "por", "del", "en"},
    "en-US": {"the", "and", "of", "to", "in", "is", "for", "with", "that", "this", "from", "on"},
    "fr-FR": {"le", "la", "les", "de", "des", "et", "pour", "dans", "une", "que", "avec", "du"},
    "pt-BR": {"o", "a", "os", "as", "de", "do", "da", "e", "para", "com", "uma", "que"},
    "de-DE": {"der", "die", "das", "und", "von", "zu", "mit", "für", "ein", "eine", "ist", "den"},
    "it-IT": {"il", "la", "le", "di", "e", "per", "con", "una", "che", "del", "nel", "un"},
    "ca-ES": {"el", "la", "els", "les", "de", "i", "per", "amb", "una", "que", "del", "en"},
}


def normalize_language_code(value, default="es-MX"):
    clean = str(value or "").strip()
    if clean == "auto" or clean in LANGUAGE_PROFILES:
        return clean
    return default


def detect_language(text_blocks, minimum_words=24):
    text = " ".join(str((block or {}).get("text") or "") for block in (text_blocks or []))
    words = re.findall(r"[^\W\d_]+", text.lower(), flags=re.UNICODE)
    if len(words) < minimum_words:
        return "und", 0.0
    scores = {code: sum(1 for word in words if word in stopwords) for code, stopwords in _STOPWORDS.items()}
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_code, best_score = ordered[0]
    second_score = ordered[1][1]
    confidence = min(0.99, best_score / max(8, len(words) * 0.08))
    if best_score < 3 or best_score <= second_score or confidence < 0.45:
        return "und", round(confidence, 3)
    return best_code, round(confidence, 3)


def resolve_language(requested_code, text_blocks):
    requested = normalize_language_code(requested_code)
    if requested == "auto":
        resolved, confidence = detect_language(text_blocks)
        source = "content"
    else:
        resolved, confidence, source = requested, 1.0, "session"
    profile = LANGUAGE_PROFILES.get(resolved, {})
    return {
        "requestedCode": requested,
        "resolvedCode": resolved,
        "confidence": confidence,
        "detectionSource": source,
        "dictionaryCandidates": list(profile.get("dictionaries") or []),
        "dictionaryProvider": "",
        "normativeProvider": profile.get("normative") or "none",
        "warnings": [] if resolved != "und" else ["No se detectó el idioma con confianza suficiente; se omitieron reglas regionales."],
    }
