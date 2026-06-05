def _safe_int(value):
    try:
        return int(str(value or "").strip())
    except (TypeError, ValueError):
        return None


def _normalize_text(value):
    return " ".join(str(value or "").strip().lower().split())


def find_section_issues(pages, stories, session):
    issues = []
    sections = ((((session or {}).get("indexConfig")) or {}).get("sections")) or []
    available_page_numbers = {
        page_number
        for page_number in (_safe_int((page or {}).get("pageName")) for page in (pages or []))
        if page_number is not None
    }
    story_texts = [_normalize_text((story or {}).get("text")) for story in (stories or [])]

    for section in sections:
        title = str((section or {}).get("title") or "").strip()
        expected_page = _safe_int((section or {}).get("expectedPageNumber"))
        if not title or not expected_page or expected_page <= 0:
            continue

        normalized_title = _normalize_text(title)
        title_found = any(normalized_title and normalized_title in story_text for story_text in story_texts)

        if expected_page not in available_page_numbers:
            issues.append({
                "sectionTitle": title,
                "expectedPageNumber": expected_page,
                "detectedPageNumber": None,
                "reason": "expected_page_not_found",
            })
            continue

        if not title_found:
            issues.append({
                "sectionTitle": title,
                "expectedPageNumber": expected_page,
                "detectedPageNumber": None,
                "reason": "title_not_found_in_stories",
            })

    return issues
