from .utils import normalize_text


def find_section_issues(pages, session):
    issues = []
    sections = (((session or {}).get("indexConfig") or {}).get("sections")) or []
    index_page_number = int((((session or {}).get("indexConfig") or {}).get("indexPageNumber")) or 0)
    for section in sections:
        title = str((section or {}).get("title") or "").strip()
        expected_page = int((section or {}).get("expectedPageNumber") or 0)
        if not title or expected_page <= 0:
            continue
        normalized_title = normalize_text(title)
        detected = None
        for page in pages:
            logical_page = int(page.get("logicalPageNumber") or page.get("printedPageNumber") or page.get("pdfPageNumber") or 0)
            if index_page_number > 0 and logical_page <= index_page_number:
                continue
            headings = page.get("headingCandidates") or []
            if any(str(entry.get("normalized") or "") == normalized_title for entry in headings):
                detected = logical_page
                break
        if detected and detected != expected_page:
            issues.append({
                "sectionTitle": title,
                "expectedPageNumber": expected_page,
                "detectedPageNumber": detected,
            })
        elif detected is None:
            issues.append({
                "sectionTitle": title,
                "expectedPageNumber": expected_page,
                "detectedPageNumber": None,
            })
    return issues

