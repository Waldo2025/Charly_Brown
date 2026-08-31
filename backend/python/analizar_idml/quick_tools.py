import unicodedata
from time import perf_counter

from .orthotypography import find_orthotypography_issues
from .language_profiles import resolve_language
from .package import open_idml
from .pages import parse_pages
from .pipeline import (
    _apply_master_content,
    _build_mapping_alias_index,
    _build_page_reports,
    _build_semantic_blocks,
    _build_style_lookup,
    _expand_alias_index_with_style_inheritance,
    _find_page_content_entry,
    _select_semantic_story_blocks,
)
from .stories import parse_stories
from .styles import parse_designmap, parse_styles
from .master_spreads import parse_master_spreads


def _resolve_used_style_entries(style_ids=None, styles=None, kind="paragraph"):
    style_ids = [str(value or "").strip() for value in (style_ids or []) if str(value or "").strip()]
    style_bucket = "paragraphStyles" if kind == "paragraph" else "characterStyles"
    lookup = _build_style_lookup((styles or {}).get(style_bucket) or [])
    seen = set()
    entries = []
    for style_id in style_ids:
        style_name = lookup.get(style_id) or (style_id.split("/", 1)[-1] if "/" in style_id else style_id)
        clean_name = str(style_name or "").strip()
        if not clean_name or clean_name in seen:
            continue
        seen.add(clean_name)
        entries.append({
            "styleKind": kind,
            "styleName": clean_name,
            "alias": _build_style_alias(clean_name, kind),
            "enabled": True,
            "pageScope": "both",
            "targetPage": "",
            "excludeTargetPage": "0",
        })
    return entries


def _build_style_alias(style_name="", kind="paragraph"):
    semantic_alias = _resolve_semantic_style_alias(style_name, kind)
    if semantic_alias:
        return semantic_alias
    normalized = str(style_name or "").strip().lower()
    alias = "".join(ch if ch.isalnum() else "_" for ch in normalized)
    alias = "_".join(part for part in alias.split("_") if part)
    if not alias:
        alias = "estilo"
    return f"{kind}_{alias}" if kind == "character" else alias


def _normalize_semantic_style_text(value=""):
    normalized = unicodedata.normalize("NFD", str(value or "").strip().lower())
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return " ".join("".join(ch if ch.isalnum() else " " for ch in normalized).split())


def _resolve_semantic_style_alias(style_name="", kind="paragraph"):
    if kind != "paragraph":
        return ""
    normalized = _normalize_semantic_style_text(style_name)
    if "campo formativo" in normalized:
        return "campo_formativo"
    return ""


def build_idml_template_from_file(input_path, session=None):
    started_at = perf_counter()
    with open_idml(input_path) as archive:
        designmap = parse_designmap(archive)
        styles = parse_styles(archive, designmap.get("stylesSource") or "Resources/Styles.xml")
        stories = parse_stories(archive, designmap.get("storySources") or None)
    paragraph_style_ids = []
    character_style_ids = []
    for story in stories or []:
        paragraph_style_ids.extend(story.get("paragraphStyleIds") or [])
        character_style_ids.extend(story.get("characterStyleIds") or [])
    paragraph_entries = _resolve_used_style_entries(paragraph_style_ids, styles, "paragraph")
    character_entries = _resolve_used_style_entries(character_style_ids, styles, "character")
    return {
        "ok": True,
        "sourceType": "idml",
        "entryCount": len(paragraph_entries) + len(character_entries),
        "paragraphStyleCount": len(paragraph_entries),
        "characterStyleCount": len(character_entries),
        "entries": paragraph_entries + character_entries,
        "durationMs": int((perf_counter() - started_at) * 1000),
    }


def _build_issue_detail(issue=None, pages_by_name=None):
    issue = issue or {}
    pages_by_name = pages_by_name or {}
    page_name = str(issue.get("pageName") or "").strip()
    page = pages_by_name.get(page_name) or {}
    page_item = _find_page_content_entry(
        page,
        story_id=issue.get("storyId") or "",
        style_name=issue.get("styleName") or "",
        excerpt=issue.get("excerpt") or "",
    ) or {}
    paragraph_text = str(page_item.get("text") or issue.get("context") or "").strip()
    return {
        "pageName": page_name,
        "storyId": str(issue.get("storyId") or "").strip(),
        "styleName": str(page_item.get("styleName") or issue.get("styleName") or "").strip(),
        "paragraphText": paragraph_text,
        "excerpt": str(issue.get("excerpt") or "").strip(),
        "suggestion": str(issue.get("suggestion") or "").strip(),
        "message": str(issue.get("message") or "").strip(),
        "context": str(issue.get("context") or "").strip(),
    }


def analyze_idml_quick_orthotypography(input_path, session=None):
    started_at = perf_counter()
    session = session or {}
    with open_idml(input_path) as archive:
        designmap = parse_designmap(archive)
        styles = parse_styles(archive, designmap.get("stylesSource") or "Resources/Styles.xml")
        alias_index = _expand_alias_index_with_style_inheritance(
            _build_mapping_alias_index(session),
            styles,
            allow_name_variants=True,
        )
        pages = parse_pages(archive, designmap.get("spreadSources") or None)
        master_spreads = parse_master_spreads(archive, designmap.get("masterSpreadSources") or None)
        stories = parse_stories(archive, designmap.get("storySources") or None)
        page_reports = _build_page_reports(pages, stories, styles, alias_index=alias_index)
        page_reports = _apply_master_content(page_reports, master_spreads, stories, styles, alias_index=alias_index)
    semantic_blocks = _select_semantic_story_blocks(_build_semantic_blocks(page_reports))
    language = resolve_language((session or {}).get("languageCode") or "es-MX", semantic_blocks)
    for block in semantic_blocks:
        block["languageCode"] = language["resolvedCode"]
    orthotypography_issues = find_orthotypography_issues(
        semantic_blocks,
        gemini_verifier=None,
        max_windows=9999,
        max_issues=9999,
        language_code=language["resolvedCode"],
        max_windows_per_story=9999,
    )
    pages_by_name = {
        str((page or {}).get("pageName") or "").strip(): page
        for page in page_reports or []
        if str((page or {}).get("pageName") or "").strip()
    }
    grouped = {}
    for issue in orthotypography_issues:
        detail = _build_issue_detail(issue, pages_by_name)
        if not detail["pageName"]:
            continue
        bucket = grouped.setdefault(detail["pageName"], {
            "pageName": detail["pageName"],
            "issues": [],
        })
        bucket["issues"].append(detail)
    pages_with_errors = [
        grouped[key]
        for key in sorted(grouped, key=lambda value: (int(value) if str(value).isdigit() else 999999, str(value)))
        if grouped[key]["issues"]
    ]
    return {
        "ok": True,
        "status": "completed",
        "sourceType": "idml",
        "orthotypographyIssueCount": sum(len(page["issues"]) for page in pages_with_errors),
        "pageCount": len(page_reports),
        "pages": pages_with_errors,
        "durationMs": int((perf_counter() - started_at) * 1000),
        "language": language,
    }
