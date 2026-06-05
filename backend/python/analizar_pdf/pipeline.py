import time

from .gemini_verifier import GeminiVerifier
from .pages import build_page_records
from .pagination import find_pagination_issues
from .sections import find_section_issues
from .spelling import find_spelling_issues
from .utils import debug_log


def analyze_document(doc, session):
    started = time.time()
    pages = build_page_records(doc)
    debug_log("pages.built", count=len(pages))
    metadata_page_labels = sum(1 for page in pages if str(page.get("logicalPageSource") or "") == "pdf-label")
    debug_log("page-labels.loaded", count=metadata_page_labels)
    pagination_issues = find_pagination_issues(pages)
    debug_log("pagination.checked", issues=len(pagination_issues))
    section_issues = find_section_issues(pages, session)
    debug_log("sections.checked", issues=len(section_issues))
    gemini_verifier = GeminiVerifier()
    spelling_issues = find_spelling_issues(pages, gemini_verifier=gemini_verifier)
    debug_log("spelling.checked", issues=len(spelling_issues))
    return {
        "paginationIssues": pagination_issues,
        "sectionIssues": section_issues,
        "spellingIssues": spelling_issues,
        "orthotypographyIssues": [],
        "colorIssues": [],
        "stats": {
            "pageCount": len(pages),
            "spellProvider": "pyenchant",
            "geminiVerifierEnabled": bool(gemini_verifier.enabled),
            "sourceType": "pdf",
            "durationMs": round((time.time() - started) * 1000),
        },
    }
