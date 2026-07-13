import re


COMPLEMENT_CODE_PATTERN = re.compile(
    r"\b(?:recortables?|anexos?|fichas?|videos?)\s+(?!aqu[ií]\b)(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]{2,14}\b)(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]*\d)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+\b",
    re.IGNORECASE,
)
TECHNICAL_LABEL_PATTERN = re.compile(
    r"\b(?:recortables?|anexos?|fichas?|videos?|p[áa]gina|nivel|trimestre|unidad)\b",
    re.IGNORECASE,
)


def _normalize_text(text=""):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _iter_text_windows(block, window_size=1200):
    text = _normalize_text((block or {}).get("text") or "")
    if len(text) < 70:
        return
    if len(text) <= window_size:
        yield {**(block or {}), "text": text}
        return

    cursor = 0
    while cursor < len(text):
        upper = min(cursor + window_size, len(text))
        if upper < len(text):
            boundary = max(
                text.rfind(". ", cursor, upper),
                text.rfind("? ", cursor, upper),
                text.rfind("! ", cursor, upper),
                text.rfind("; ", cursor, upper),
            )
            if boundary <= cursor + 180:
                boundary = text.rfind(" ", cursor, upper)
            if boundary > cursor + 180:
                upper = boundary + 1
        chunk = text[cursor:upper].strip()
        if len(chunk) >= 70:
            yield {**(block or {}), "text": chunk}
        cursor = upper + 1


def _count_words(text=""):
    return len(re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}", str(text or "")))


def _looks_like_complement_reference(text=""):
    normalized = _normalize_text(text)
    if not normalized:
        return False
    if COMPLEMENT_CODE_PATTERN.search(normalized):
        words = _count_words(normalized)
        technical_words = len(TECHNICAL_LABEL_PATTERN.findall(normalized))
        if words <= 16 or technical_words >= 2:
            return True
    return False


def _is_candidate_block(block=None):
    text = _normalize_text((block or {}).get("text") or "")
    if len(text) < 70:
        return False
    if _count_words(text) < 10:
        return False
    if _looks_like_complement_reference(text):
        return False
    style_name = str((block or {}).get("styleName") or "").lower()
    block_type = str((block or {}).get("blockType") or "").lower()
    ignored_markers = (
        "folio",
        "pie de pagina",
        "pie_de_pagina",
        "recortable_indicador",
        "recortable_destination",
        "recortable_footer",
    )
    return not any(marker in style_name or marker in block_type for marker in ignored_markers)


def _build_context(text="", excerpt="", radius=140):
    source = str(text or "")
    needle = str(excerpt or "")
    if not source or not needle:
        return needle
    start = source.lower().find(needle.lower())
    if start < 0:
        return needle
    end = start + len(needle)
    return source[max(0, start - radius):min(len(source), end + radius)].strip()


def _is_valid_redaction_issue(text="", excerpt="", suggestion="", reason="", confidence=0.0):
    clean_text = _normalize_text(text)
    clean_excerpt = _normalize_text(excerpt)
    clean_suggestion = _normalize_text(suggestion)
    clean_reason = _normalize_text(reason)
    if confidence < 0.72:
        return False
    if not clean_excerpt or not clean_suggestion or not clean_reason:
        return False
    if len(clean_excerpt) < 25 or len(clean_suggestion) < 25:
        return False
    if len(clean_excerpt) > 500 or len(clean_suggestion) > 700:
        return False
    if clean_excerpt.lower() == clean_suggestion.lower():
        return False
    if clean_excerpt.lower() not in clean_text.lower():
        return False
    if _looks_like_complement_reference(clean_excerpt):
        return False
    return True


def _build_message(page_name="", reason=""):
    clean_page = str(page_name or "").strip()
    clean_reason = str(reason or "La redacción puede resultar ambigua o poco clara.").strip()
    if clean_page:
        return f"Página {clean_page}: {clean_reason}"
    return clean_reason


def find_redaction_issues(text_blocks, gemini_verifier=None, max_windows=8, max_issues=20, max_windows_per_story=1):
    if gemini_verifier is None or not getattr(gemini_verifier, "enabled", False):
        return []

    issues = []
    seen = set()
    processed_windows = 0
    story_windows = {}
    for block in text_blocks or []:
        if not _is_candidate_block(block):
            continue
        story_id = str((block or {}).get("storyId") or "")
        for window in _iter_text_windows(block):
            if processed_windows >= max_windows or len(issues) >= max_issues:
                return issues
            current_story_windows = story_windows.get(story_id, 0)
            if current_story_windows >= max_windows_per_story:
                break
            processed_windows += 1
            story_windows[story_id] = current_story_windows + 1
            for item in gemini_verifier.verify_text_block(window, "redaction"):
                excerpt = _normalize_text(item.get("excerpt") or "")
                suggestion = _normalize_text(item.get("suggestion") or "")
                reason = _normalize_text(item.get("reason") or "")
                try:
                    confidence = float(item.get("confidence"))
                except (TypeError, ValueError):
                    confidence = 0.75
                if not _is_valid_redaction_issue(window.get("text"), excerpt, suggestion, reason, confidence):
                    continue
                signature = (
                    str(window.get("pageName") or ""),
                    str(window.get("storyId") or ""),
                    excerpt.lower(),
                    suggestion.lower(),
                )
                if signature in seen:
                    continue
                seen.add(signature)
                issues.append({
                    "pageName": window.get("pageName") or "",
                    "storyId": window.get("storyId") or "",
                    "storyTitle": window.get("storyTitle") or "",
                    "storySource": window.get("storySource") or "",
                    "blockType": window.get("blockType") or "",
                    "styleName": window.get("styleName") or "",
                    "frameRect": window.get("frameRect") or None,
                    "message": _build_message(window.get("pageName"), reason),
                    "context": _build_context(window.get("text"), excerpt),
                    "excerpt": excerpt,
                    "suggestion": suggestion,
                    "reason": reason,
                    "confidence": round(max(0.0, min(1.0, confidence)), 2),
                    "severity": "suggestion",
                    "code": "redaction_clarity",
                    "providers": ["gemini"],
                })
                if len(issues) >= max_issues:
                    return issues
    return issues
