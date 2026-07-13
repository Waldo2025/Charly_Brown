import re


def _normalize_text(text):
    raw = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = []
    for fragment in raw.split("\n"):
        clean = re.sub(r"[ \t]+", " ", fragment).strip()
        if clean:
            paragraphs.append(clean)
        elif paragraphs and paragraphs[-1] != "":
            paragraphs.append("")
    normalized = "\n".join(paragraphs).strip()
    return normalized


def _iter_text_windows(block, window_size=900):
    text = str((block or {}).get("text") or "")
    normalized = _normalize_text(text)
    if len(normalized) < 20:
        return
    if len(normalized) <= window_size:
        yield {
            **block,
            "text": normalized,
        }
        return

    cursor = 0
    while cursor < len(normalized):
        upper = min(cursor + window_size, len(normalized))
        if upper < len(normalized):
            strong_boundary = max(
                normalized.rfind("\n", cursor, upper),
                normalized.rfind(". ", cursor, upper),
                normalized.rfind("! ", cursor, upper),
                normalized.rfind("? ", cursor, upper),
                normalized.rfind(".\n", cursor, upper),
                normalized.rfind("!\n", cursor, upper),
                normalized.rfind("?\n", cursor, upper),
            )
            boundary = strong_boundary if strong_boundary > cursor + 120 else normalized.rfind(" ", cursor, upper)
            if boundary > cursor + 120:
                upper = boundary + (1 if normalized[boundary:boundary + 1] in ".!?" else 0)
        chunk = normalized[cursor:upper].strip()
        if len(chunk) >= 20:
            yield {
                **block,
                "text": chunk,
            }
        cursor = upper + 1


def _build_context(text, excerpt, radius=60):
    haystack = str(text or "")
    needle = str(excerpt or "")
    if not haystack or not needle:
        return needle
    start = haystack.lower().find(needle.lower())
    if start < 0:
        return needle
    end = start + len(needle)
    context_start = max(0, start - radius)
    context_end = min(len(haystack), end + radius)
    return haystack[context_start:context_end].strip()


def _is_valid_issue(text, excerpt, suggestion):
    clean_excerpt = str(excerpt or "").strip()
    clean_suggestion = str(suggestion or "").strip()
    if not clean_excerpt or not clean_suggestion:
        return False
    if len(clean_excerpt) > 80 or len(clean_suggestion) > 80:
        return False
    if clean_excerpt.lower() == clean_suggestion.lower():
        return False
    normalized_text = re.sub(r"\s+", " ", str(text or "")).strip()
    normalized_excerpt = re.sub(r"\s+", " ", clean_excerpt).strip()
    normalized_suggestion = re.sub(r"\s+", " ", clean_suggestion).strip()
    text_lower = normalized_text.lower()
    excerpt_lower = normalized_excerpt.lower()
    if excerpt_lower not in text_lower:
        return False
    if normalized_suggestion.startswith("¿") and normalized_excerpt.endswith("?"):
        start = text_lower.find(excerpt_lower)
        last_opening = text_lower.rfind("¿", 0, start)
        last_closing = text_lower.rfind("?", 0, start)
        if last_opening > last_closing:
            return False
    return True


def _build_issue_message(page_name="", reason="", excerpt="", suggestion=""):
    clean_reason = str(reason or "Posible incidencia ortotipografica.").strip()
    clean_page = str(page_name or "").strip()
    clean_excerpt = str(excerpt or "").strip()
    clean_suggestion = str(suggestion or "").strip()
    details = clean_reason
    if clean_excerpt and clean_suggestion:
        details = f"{clean_reason} Fragmento: \"{clean_excerpt}\". Sugerencia: \"{clean_suggestion}\"."
    if clean_page:
        return f"Página {clean_page}: {details}"
    return details


def _append_local_issue(issues, seen, block, text, excerpt, suggestion, reason, max_issues):
    clean_excerpt = str(excerpt or "").strip()
    clean_suggestion = str(suggestion or "").strip()
    if not clean_excerpt or not clean_suggestion:
        return False
    signature = (
        str((block or {}).get("pageName") or ""),
        str((block or {}).get("storyId") or ""),
        clean_excerpt.lower(),
        clean_suggestion.lower(),
    )
    if signature in seen:
        return False
    seen.add(signature)
    issues.append({
        "pageName": (block or {}).get("pageName") or "",
        "storyId": (block or {}).get("storyId") or "",
        "storyTitle": (block or {}).get("storyTitle") or "",
        "storySource": (block or {}).get("storySource") or "",
        "blockType": (block or {}).get("blockType") or "",
        "styleName": (block or {}).get("styleName") or "",
        "frameRect": (block or {}).get("frameRect") or None,
        "message": _build_issue_message((block or {}).get("pageName"), reason, clean_excerpt, clean_suggestion),
        "context": _build_context(text, clean_excerpt),
        "excerpt": clean_excerpt,
        "suggestion": clean_suggestion,
        "providers": ["local-rules"],
    })
    return len(issues) >= max_issues


def _iter_questions_without_opening_mark(text):
    source = re.sub(r"\s+", " ", str(text or "")).strip()
    if "?" not in source:
        return
    for question_match in re.finditer(r"\?", source):
        prefix = source[:question_match.end()]
        last_opening = prefix.rfind("¿", 0, -1)
        last_closing = prefix.rfind("?", 0, -1)
        if last_opening > last_closing:
            continue
        previous_boundary = max(
            prefix.rfind(".", 0, -1),
            prefix.rfind("!", 0, -1),
            last_closing,
        )
        segment = prefix[previous_boundary + 1:].strip()
        if not segment or "¿" in segment:
            continue
        if len(segment) < 8 or len(segment) > 180:
            continue
        if len(re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}", segment)) < 2:
            continue
        yield segment, f"¿{segment}"


def _build_spacing_before_punctuation_pair(text="", start=0, end=0, punctuation=""):
    source = str(text or "")
    clean_punctuation = str(punctuation or "").strip()
    prefix = source[:max(0, int(start or 0))]
    left_match = re.search(r"(\S+)\s*$", prefix)
    left_token = left_match.group(1) if left_match else ""
    raw_gap = source[max(0, int(start or 0)):max(0, int(end or 0))]
    if left_token:
        return f"{left_token}{raw_gap}", f"{left_token}{clean_punctuation}"
    return raw_gap, clean_punctuation


def _looks_like_missing_inline_value_before_comma(text="", start=0, end=0):
    source = str(text or "")
    prefix = source[:max(0, int(start or 0))]
    suffix = source[max(0, int(end or 0)):]
    left_match = re.search(r"(\S+)\s*$", prefix)
    left_token = (left_match.group(1) if left_match else "").strip("¿¡()[]{}\"'“”‘’").lower()
    right_match = re.match(r"\s*([¿¡])", suffix)
    if not right_match:
        return False
    return left_token in {
        "es",
        "son",
        "era",
        "eran",
        "fue",
        "será",
        "seran",
        "serán",
        "vale",
        "mide",
        "tiene",
    }


def _find_local_orthotypography_issues(text_blocks, max_issues=20):
    issues = []
    seen = set()
    for block in text_blocks or []:
        for window in _iter_text_windows(block, window_size=1400):
            text = str(window.get("text") or "")
            for match in re.finditer(r"\s+([,.;:!?])", text):
                if match.group(1) == "," and _looks_like_missing_inline_value_before_comma(text, match.start(), match.end()):
                    continue
                excerpt, suggestion = _build_spacing_before_punctuation_pair(
                    text,
                    match.start(),
                    match.end(),
                    match.group(1),
                )
                if _append_local_issue(issues, seen, window, text, excerpt, suggestion, "Espacio indebido antes de signo de puntuación.", max_issues):
                    return issues
            for match in re.finditer(r"([!?])\1+|\.{4,}|,{2,}|;{2,}|:{2,}", text):
                excerpt = match.group(0)
                suggestion = "…" if excerpt.startswith("....") else excerpt[0]
                if _append_local_issue(issues, seen, window, text, excerpt, suggestion, "Secuencia de puntuación anómala.", max_issues):
                    return issues
            for excerpt, suggestion in _iter_questions_without_opening_mark(text):
                if _append_local_issue(issues, seen, window, text, excerpt, suggestion, "Pregunta sin signo de apertura.", max_issues):
                    return issues
            if text.count("(") != text.count(")"):
                excerpt = "(" if text.count("(") > text.count(")") else ")"
                suggestion = "Revisar paréntesis de apertura y cierre"
                if _append_local_issue(issues, seen, window, text, excerpt, suggestion, "Paréntesis desbalanceados.", max_issues):
                    return issues
    return issues


def find_orthotypography_issues(text_blocks, gemini_verifier=None, max_windows=10, max_issues=20, max_windows_per_story=2):
    issues = _find_local_orthotypography_issues(text_blocks, max_issues=max_issues)
    seen = {
        (
            str(issue.get("storyId") or ""),
            str(issue.get("excerpt") or "").lower(),
            str(issue.get("suggestion") or "").lower(),
        )
        for issue in issues
    }
    if len(issues) >= max_issues:
        return issues
    if gemini_verifier is None or not getattr(gemini_verifier, "enabled", False):
        return issues

    processed_windows = 0
    story_windows = {}
    for block in text_blocks or []:
        story_id = str((block or {}).get("storyId") or "")
        for window in _iter_text_windows(block):
            if processed_windows >= max_windows or len(issues) >= max_issues:
                return issues
            current_story_windows = story_windows.get(story_id, 0)
            if current_story_windows >= max_windows_per_story:
                break
            processed_windows += 1
            story_windows[story_id] = current_story_windows + 1
            for item in gemini_verifier.verify_text_block(window, "orthotypography"):
                excerpt = str(item.get("excerpt") or "").strip()
                suggestion = str(item.get("suggestion") or "").strip()
                if not _is_valid_issue(window.get("text"), excerpt, suggestion):
                    continue
                signature = (
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
                    "message": _build_issue_message(window.get("pageName"), item.get("reason"), excerpt, suggestion),
                    "context": _build_context(window.get("text"), excerpt),
                    "excerpt": excerpt,
                    "suggestion": suggestion,
                    "providers": ["gemini"],
                })
                if len(issues) >= max_issues:
                    return issues
    return issues
