import re


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
    return True


def _build_issue_message(page_name="", reason=""):
    clean_reason = str(reason or "Posible falta de ortografia.").strip()
    clean_page = str(page_name or "").strip()
    if clean_page:
        return f"Página {clean_page}: {clean_reason}"
    return clean_reason


def find_spelling_issues(text_blocks, gemini_verifier=None, max_windows=10, max_issues=20, max_windows_per_story=2):
    if gemini_verifier is None or not getattr(gemini_verifier, "enabled", False):
        return []

    issues = []
    seen = set()
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
