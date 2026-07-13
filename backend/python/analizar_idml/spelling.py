import re
import unicodedata

from .rae_validator import RAE_2010_UNACCENTED_MONOSYLLABLES, validate_spelling_candidate_with_rae

try:
    import enchant
except Exception:  # pragma: no cover - depends on local system dictionaries.
    enchant = None


def _normalize_text(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _iter_text_windows(block, window_size=900):
    text = str((block or {}).get("text") or "")
    normalized = _normalize_text(text)
    if len(normalized) < 40:
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
            boundary = normalized.rfind(" ", cursor, upper)
            if boundary > cursor + 120:
                upper = boundary
        chunk = normalized[cursor:upper].strip()
        if len(chunk) >= 40:
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


def _strip_accents(text):
    raw = str(text or "")
    if not raw:
        return ""
    normalized = unicodedata.normalize("NFD", raw)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _count_accents(text):
    raw = str(text or "")
    if not raw:
        return 0
    normalized = unicodedata.normalize("NFD", raw)
    return sum(1 for ch in normalized if unicodedata.category(ch) == "Mn")


def _is_valid_spelling_match(text, excerpt, suggestion):
    clean_excerpt = str(excerpt or "").strip()
    clean_suggestion = str(suggestion or "").strip()
    if not clean_excerpt or not clean_suggestion:
        return False
    if len(clean_excerpt) > 48 or len(clean_suggestion) > 48:
        return False
    if clean_excerpt.lower() == clean_suggestion.lower():
        return False
    if clean_excerpt.lower() not in str(text or "").lower():
        return False
    if " " in clean_suggestion or "\n" in clean_suggestion:
        return False
    accent_fold_excerpt = _strip_accents(clean_excerpt).lower()
    accent_fold_suggestion = _strip_accents(clean_suggestion).lower()
    if accent_fold_excerpt == accent_fold_suggestion:
        if accent_fold_excerpt in RAE_2010_UNACCENTED_MONOSYLLABLES:
            return False
        excerpt_accents = _count_accents(clean_excerpt)
        suggestion_accents = _count_accents(clean_suggestion)
        if excerpt_accents > 0:
            return False
        if suggestion_accents <= excerpt_accents:
            return False
    return True


def _build_issue_message(page_name="", reason=""):
    clean_reason = str(reason or "Posible falta de ortografia.").strip()
    clean_page = str(page_name or "").strip()
    if clean_page:
        return f"Página {clean_page}: {clean_reason}"
    return clean_reason


def _resolve_dictionary(candidates):
    if enchant is None:
        return None, ""
    for code in candidates:
        try:
            return enchant.Dict(code), code
        except Exception:
            continue
    return None, ""


def _extract_tokens_with_positions(text=""):
    pattern = r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]{2,}"
    return [(match.group(0), match.start()) for match in re.finditer(pattern, str(text or ""))]


def _compact_alpha(value=""):
    return re.sub(r"[^a-záéíóúüñ]", "", str(value or "").strip().lower())


def _should_ignore_local_token(token=""):
    clean = str(token or "").strip()
    if len(clean) < 4:
        return True
    if "-" in clean or any(char.isdigit() for char in clean):
        return True
    if clean.isupper():
        return True
    if clean[0].isupper() and len(clean) >= 4:
        return True
    compact = _compact_alpha(clean)
    if not compact:
        return True
    if _strip_accents(compact) in RAE_2010_UNACCENTED_MONOSYLLABLES:
        return True
    return compact in {
        "recortable",
        "anexo",
        "ficha",
        "video",
        "pagina",
        "paginas",
    }


def _merge_suggestions(*groups):
    merged = []
    seen = set()
    for group in groups:
        for value in group or []:
            clean = str(value or "").strip()
            key = clean.lower()
            if not clean or key in seen:
                continue
            seen.add(key)
            merged.append(clean)
            if len(merged) >= 4:
                return merged
    return merged


def _is_reliable_local_suggestion(token="", suggestions=None):
    raw_token = str(token or "").strip().lower()
    normalized_token = _strip_accents(raw_token)
    if normalized_token in RAE_2010_UNACCENTED_MONOSYLLABLES:
        return ""
    for suggestion in suggestions or []:
        clean_suggestion = str(suggestion or "").strip()
        if not clean_suggestion or " " in clean_suggestion or "-" in clean_suggestion:
            continue
        if clean_suggestion.lower() == raw_token:
            continue
        if _strip_accents(clean_suggestion).lower() != normalized_token:
            continue
        if _count_accents(clean_suggestion) <= _count_accents(raw_token):
            continue
        return clean_suggestion
    return ""


def _find_local_spelling_issues(text_blocks, max_issues=20):
    es_dict, es_code = _resolve_dictionary(["es_MX", "es", "es_ES"])
    if es_dict is None:
        return []
    issues = []
    seen = set()
    for block in text_blocks or []:
        for window in _iter_text_windows(block, window_size=1400):
            text = str(window.get("text") or "")
            for token, offset in _extract_tokens_with_positions(text):
                if _should_ignore_local_token(token):
                    continue
                if es_dict.check(token.lower()):
                    continue
                suggestions = _merge_suggestions(es_dict.suggest(token))
                accepted = _is_reliable_local_suggestion(token, suggestions)
                if not accepted:
                    continue
                if not validate_spelling_candidate_with_rae(token, accepted):
                    continue
                signature = (
                    str(window.get("pageName") or ""),
                    str(window.get("storyId") or ""),
                    token.lower(),
                    offset,
                )
                if signature in seen:
                    continue
                seen.add(signature)
                issues.append({
                    "pageName": window.get("pageName") or "",
                    "storyId": window.get("storyId") or "",
                    "storyTitle": window.get("storyTitle") or "",
                    "storySource": window.get("storySource") or "",
                    "message": _build_issue_message(window.get("pageName"), f"Posible falta de ortografía: “{token}” debería llevar acento."),
                    "context": _build_context(text, token),
                    "token": token,
                    "replacements": [accepted],
                    "providers": [es_code or "pyenchant"],
                })
                if len(issues) >= max_issues:
                    return issues
    return issues


def find_spelling_issues(text_blocks, gemini_verifier=None, max_windows=10, max_issues=20, max_windows_per_story=2):
    issues = _find_local_spelling_issues(text_blocks, max_issues=max_issues)
    seen = {
        (
            str(issue.get("storyId") or ""),
            str(issue.get("token") or "").lower(),
            str((issue.get("replacements") or [""])[0] or "").lower(),
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
            for item in gemini_verifier.verify_text_block(window, "spelling"):
                excerpt = str(item.get("excerpt") or "").strip()
                suggestion = str(item.get("suggestion") or "").strip()
                if not _is_valid_spelling_match(window.get("text"), excerpt, suggestion):
                    continue
                if not validate_spelling_candidate_with_rae(excerpt, suggestion):
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
                    "message": _build_issue_message(window.get("pageName"), item.get("reason")),
                    "context": _build_context(window.get("text"), excerpt),
                    "token": excerpt,
                    "replacements": [suggestion],
                    "providers": ["gemini"],
                })
                if len(issues) >= max_issues:
                    return issues
    return issues
