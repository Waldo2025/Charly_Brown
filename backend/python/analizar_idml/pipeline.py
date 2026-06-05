from time import perf_counter
from collections import Counter

from .colors import find_color_issues
from .document import build_document_summary
from .gemini_verifier import GeminiVerifier
from .orthotypography import find_orthotypography_issues
from .package import open_idml
from .pagination import build_pagination_report, find_pagination_issues
from .pages import parse_pages
from .sections import find_section_issues
from .spelling import find_spelling_issues
from .stories import AUTO_PAGE_NUMBER_TOKEN, parse_stories
from .master_spreads import parse_master_spreads
from .styles import parse_designmap, parse_styles
from .swatches import parse_swatches


FIELD_FORMATIVO_CATALOG = [
    {
        "label": "Lenguaje y Comunicación",
        "match": "campo formativo lenguaje y comunicación",
        "swatchName": "A_CAMPO FORMATIVO_LENGUAJES",
    },
    {
        "label": "Ética, Naturaleza y Sociedades",
        "match": "campo formativo ética, naturaleza y sociedades",
        "swatchName": "A_CAMPO FORMATIVO ETICA NAT",
    },
    {
        "label": "De lo Humano y lo Comunitario",
        "match": "campo formativo de lo humano y lo comunitario",
        "swatchName": "A_CAMPO FORMATIVO_ DE LO HUMANO",
    },
    {
        "label": "Saberes y Pensamiento Científico",
        "match": "campo formativo saberes y pensamiento científico",
        "swatchName": "A_CAMPO FORMATIVO_SABERES CIENT",
    },
]


def _normalize_story_text(text):
    return " ".join(str(text or "").split()).strip().lower()


def _build_swatch_lookup(swatches):
    lookup = {}
    for swatch in swatches or []:
        name = str((swatch or {}).get("name") or "").strip()
        if name:
            lookup[name] = swatch
    return lookup


def _select_semantic_story_blocks(stories, limit=18):
    ranked = sorted(
        (entry for entry in (stories or []) if len(str((entry or {}).get("text") or "").strip()) >= 80),
        key=lambda entry: len(str(entry.get("text") or "")),
        reverse=True,
    )
    selected = []
    seen = set()
    for entry in ranked:
        normalized = _normalize_story_text(entry.get("text"))
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        selected.append(entry)
        if len(selected) >= limit:
            break
    return selected


def _build_configuration_warnings(session):
    warnings = []
    sections = ((((session or {}).get("indexConfig")) or {}).get("sections")) or []
    palette = ((((session or {}).get("colorConfig")) or {}).get("palette")) or []
    if not sections:
        warnings.append("No hay secciones configuradas. La validación de checklist estructural está desactivada.")
    if not palette:
        warnings.append("No hay paleta configurada. La validación de colores solo reporta inventario, no discrepancias.")
    return warnings


def _build_page_preview(pages, limit=12):
    return [
        {
            "pageId": page.get("pageId") or "",
            "pageName": page.get("pageName") or "",
            "spreadId": page.get("spreadId") or "",
            "appliedMaster": page.get("appliedMaster") or "",
        }
        for page in (pages or [])[:limit]
    ]


def _build_swatch_inventory(swatches, limit=24):
    return [
        {
            "name": swatch.get("name") or "",
            "space": swatch.get("space") or "",
            "model": swatch.get("model") or "",
            "cmyk": swatch.get("cmyk") or "",
            "hex": swatch.get("hex") or "",
        }
        for swatch in (swatches or [])[:limit]
    ]


def _build_style_lookup(entries):
    return {
        str((entry or {}).get("self") or "").strip(): str((entry or {}).get("name") or "").strip()
        for entry in (entries or [])
        if str((entry or {}).get("self") or "").strip()
    }


def _normalize_style_ref(value=""):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "/" in raw:
        return raw.split("/", 1)[-1]
    return raw


def _normalize_color_ref(value=""):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "/" in raw:
        return raw.split("/", 1)[-1]
    return raw


def _classify_paragraph_kind(style_name=""):
    normalized = str(style_name or "").strip().lower()
    if not normalized:
        return "otro"
    if "subtitulo" in normalized:
        return "subtítulos"
    if "titulo" in normalized and "subtitulo" not in normalized:
        return "títulos"
    if "instruccion" in normalized:
        return "instrucciones"
    if "numerado" in normalized or "bullets" in normalized or "nivel 1" in normalized or "nivel 2" in normalized or "nivel 3" in normalized:
        return "subinstrucciones"
    if "texto" in normalized or "tablas cuerpo" in normalized or "respuesta alumno" in normalized or "temario" in normalized or "cajas" in normalized or "pie de foto" in normalized:
        return "párrafos normales"
    return "otro"


def _append_block_to_page(
    page,
    story,
    block,
    paragraph_lookup,
    character_lookup,
    paragraph_style_details,
    character_style_details,
    from_master=False,
):
    paragraph_style_id = str(block.get("paragraphStyleId") or "").strip()
    paragraph_style_name = paragraph_lookup.get(paragraph_style_id) or _normalize_style_ref(paragraph_style_id)
    paragraph_style = paragraph_style_details.get(paragraph_style_id) or {}
    char_ids = [str(value or "").strip() for value in (block.get("characterStyleIds") or []) if str(value or "").strip()]
    char_names = [character_lookup.get(style_id) or _normalize_style_ref(style_id) for style_id in char_ids]
    swatches = []
    para_fill = _normalize_color_ref(paragraph_style.get("fillColor", ""))
    if para_fill:
        swatches.append(para_fill)
    for style_id in char_ids:
        char_fill = _normalize_color_ref((character_style_details.get(style_id) or {}).get("fillColor", ""))
        if char_fill:
            swatches.append(char_fill)
    unique_swatches = []
    for name in swatches:
        if name and name not in unique_swatches:
            unique_swatches.append(name)
    kind = _classify_paragraph_kind(paragraph_style_name)
    target_key = "masterContent" if from_master else "content"
    page[target_key][kind].append({
        "pageName": page.get("pageName") or "",
        "storyId": story.get("storyId") or "",
        "storyTitle": story.get("storyTitle") or "",
        "styleName": paragraph_style_name,
        "blockType": kind,
        "text": str(block.get("text") or "").strip(),
        "characterStyles": char_names,
        "swatches": unique_swatches,
        "fromMaster": bool(from_master),
    })
    if paragraph_style_name and paragraph_style_name not in page["paragraphStyles"]:
        page["paragraphStyles"].append(paragraph_style_name)
    for char_name in char_names:
        if char_name and char_name not in page["characterStyles"]:
            page["characterStyles"].append(char_name)
    for swatch_name in unique_swatches:
        if swatch_name and swatch_name not in page["textSwatches"]:
            page["textSwatches"].append(swatch_name)


def _iter_page_bucket_items(page, include_master=False):
    sources = [page.get("content") or {}]
    if include_master:
        sources.append(page.get("masterContent") or {})
    for source in sources:
        for bucket_items in source.values():
            for item in bucket_items or []:
                yield item


def _extract_footer_markers(page):
    markers = {
        "sectionName": "",
        "sectionTitle": "",
        "sectionCode": "",
        "trimester": "",
        "grade": "",
        "pageNumber": "",
        "skills": [],
    }
    for item in _iter_page_bucket_items(page, include_master=True):
        text = str(item.get("text") or "").strip()
        normalized_text = page.get("pageName") or "" if text == AUTO_PAGE_NUMBER_TOKEN else text
        if not normalized_text:
            continue
        style_name = str(item.get("styleName") or "").strip().upper()
        styles = [str(value or "").strip().upper() for value in (item.get("characterStyles") or []) if str(value or "").strip()]
        if style_name == "01_00_TITULO" and not markers["sectionName"]:
            markers["sectionName"] = normalized_text
        if any(style == "Z_FOLIO_UNIDAD" for style in styles) and not markers["sectionCode"]:
            markers["sectionCode"] = normalized_text
        if style_name == "01_05 TITULO SECCION Y COMPETENCIA" and not markers["sectionTitle"]:
            markers["sectionTitle"] = normalized_text
        if any(style == "Z_FOLIO_TIRMESTRE" for style in styles) and not markers["trimester"]:
            markers["trimester"] = normalized_text
        if any(style == "Z_FOLIO_NIVEL" for style in styles) and not markers["grade"]:
            markers["grade"] = normalized_text
        if any(style in {"Z_FOLIOS", "Z_FOLIOS RECORTABLES"} for style in styles) and not markers["pageNumber"]:
            markers["pageNumber"] = normalized_text
        if style_name == "08_05_02 HABILIDADES" and normalized_text and normalized_text not in markers["skills"]:
            markers["skills"].append(normalized_text)
    return markers


def _resolve_master_display_name(master, fallback=""):
    if not master:
        return str(fallback or "").strip()
    return f"{master.get('namePrefix', '')}{master.get('baseName', '')}".strip() or str(fallback or "").strip()


def _find_base_master(master_spreads):
    for master in (master_spreads or {}).values():
        prefix = str(master.get("namePrefix") or "").strip().upper()
        base_name = str(master.get("baseName") or "").strip().upper()
        if prefix == "BASE" and base_name == "BASE":
            return master
    return None


def _extract_field_profiles(page, swatch_lookup):
    profiles = []
    seen = set()
    for item in _iter_page_bucket_items(page, include_master=True):
        style_name = str(item.get("styleName") or "").strip().upper()
        if style_name != "01_04_CAMPO FORMATIVO":
            continue
        text = _normalize_story_text(item.get("text"))
        if not text or text.endswith("xxx"):
            continue
        for field in FIELD_FORMATIVO_CATALOG:
            if field["match"] not in text or field["swatchName"] in seen:
                continue
            seen.add(field["swatchName"])
            swatch = swatch_lookup.get(field["swatchName"]) or {}
            profiles.append({
                "label": field["label"],
                "swatchName": field["swatchName"],
                "cmyk": swatch.get("cmyk") or "",
                "hex": swatch.get("hex") or "",
            })
            break
    return profiles


def _build_style_usage(stories, styles, key, label_key):
    lookup = _build_style_lookup(styles.get(label_key) or [])
    counter = Counter()
    for story in stories or []:
        for style_id in story.get(key) or []:
            clean = str(style_id or "").strip()
            if clean:
                counter[clean] += 1
    rows = []
    for style_id, uses in counter.most_common(10):
        rows.append({
            "styleId": style_id,
            "styleName": lookup.get(style_id) or style_id,
            "uses": uses,
        })
    return rows


def _build_story_preview(stories, limit=6):
    ranked = sorted(
        (entry for entry in (stories or []) if str((entry or {}).get("text") or "").strip()),
        key=lambda entry: len(str(entry.get("text") or "")),
        reverse=True,
    )
    preview = []
    for entry in ranked[:limit]:
        text = " ".join(str(entry.get("text") or "").split())
        preview.append({
            "storyId": entry.get("storyId") or "",
            "storyTitle": entry.get("storyTitle") or "",
            "length": len(text),
            "excerpt": text[:220],
        })
    return preview


def _build_page_reports(pages, stories, styles):
    paragraph_lookup = _build_style_lookup(styles.get("paragraphStyles") or [])
    character_lookup = _build_style_lookup(styles.get("characterStyles") or [])
    paragraph_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("paragraphStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }
    character_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("characterStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }
    stories_by_id = {
        str((story or {}).get("storyId") or "").strip(): story
        for story in (stories or [])
        if str((story or {}).get("storyId") or "").strip()
    }
    reports = []
    for page in pages or []:
        grouped = {
            "títulos": [],
            "subtítulos": [],
            "instrucciones": [],
            "subinstrucciones": [],
            "párrafos normales": [],
            "otro": [],
        }
        master_grouped = {
            "títulos": [],
            "subtítulos": [],
            "instrucciones": [],
            "subinstrucciones": [],
            "párrafos normales": [],
            "otro": [],
        }
        paragraph_styles_used = []
        character_styles_used = []
        text_swatches = []
        for story_ref in page.get("storyRefs") or []:
            story = stories_by_id.get(str(story_ref.get("storyId") or "").strip())
            if not story:
                continue
            for block in story.get("paragraphBlocks") or []:
                temp_page = {
                    "pageName": page.get("pageName") or "",
                    "content": grouped,
                    "masterContent": master_grouped,
                    "paragraphStyles": paragraph_styles_used,
                    "characterStyles": character_styles_used,
                    "textSwatches": text_swatches,
                }
                _append_block_to_page(
                    temp_page,
                    story,
                    block,
                    paragraph_lookup,
                    character_lookup,
                    paragraph_style_details,
                    character_style_details,
                    from_master=False,
                )
        reports.append({
            "pageName": page.get("pageName") or "",
            "pageId": page.get("pageId") or "",
            "pageIndex": page.get("pageIndex") or 0,
            "spreadId": page.get("spreadId") or "",
            "appliedMaster": page.get("appliedMaster") or "",
            "masterName": page.get("appliedMaster") or "",
            "storyCount": len(page.get("storyRefs") or []),
            "paragraphStyles": paragraph_styles_used,
            "characterStyles": character_styles_used,
            "textSwatches": text_swatches,
            "frameSwatches": page.get("frameSwatches") or [],
            "content": grouped,
            "masterContent": master_grouped,
            "fieldProfiles": [],
            "footerMarkers": {"sectionName": "", "sectionTitle": "", "sectionCode": "", "trimester": "", "grade": "", "pageNumber": "", "skills": []},
            "numbering": None,
            "spellingIssues": [],
            "orthotypographyIssues": [],
        })
    return reports


def _apply_master_content(page_reports, master_spreads, stories, styles):
    if not master_spreads:
        return page_reports
    stories_by_id = {
        str((story or {}).get("storyId") or "").strip(): story
        for story in (stories or [])
        if str((story or {}).get("storyId") or "").strip()
    }
    paragraph_lookup = _build_style_lookup(styles.get("paragraphStyles") or [])
    character_lookup = _build_style_lookup(styles.get("characterStyles") or [])
    paragraph_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("paragraphStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }
    character_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("characterStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }

    def apply_single_master(page, master):
        if not master or not master.get("showMasterItems"):
            return
        page_index = int(page.get("pageIndex") or 0)
        master_pages = master.get("pages") or []
        if not master_pages:
            return
        target_master_page = master_pages[min(page_index, len(master_pages) - 1)]
        for story_ref in target_master_page.get("storyRefs") or []:
            story = stories_by_id.get(str(story_ref.get("storyId") or "").strip())
            if not story:
                continue
            for block in story.get("paragraphBlocks") or []:
                _append_block_to_page(
                    page,
                    story,
                    block,
                    paragraph_lookup,
                    character_lookup,
                    paragraph_style_details,
                    character_style_details,
                    from_master=True,
                )
        for swatch_name in target_master_page.get("frameSwatches") or []:
            if swatch_name and swatch_name not in page["frameSwatches"]:
                page["frameSwatches"].append(swatch_name)

    base_master = _find_base_master(master_spreads)
    for page in page_reports or []:
        if base_master:
            apply_single_master(page, base_master)
        master_id = str(page.get("appliedMaster") or "").strip()
        master = master_spreads.get(master_id)
        apply_single_master(page, master)
        page["masterName"] = _resolve_master_display_name(master, master_id)
        page["footerMarkers"] = _extract_footer_markers(page)
    return page_reports


def _build_semantic_blocks(page_reports):
    blocks = []
    for page in page_reports or []:
        for block_type, entries in (page.get("content") or {}).items():
            for entry in entries or []:
                blocks.append({
                    "pageName": page.get("pageName") or "",
                    "storyId": entry.get("storyId") or "",
                    "storyTitle": entry.get("storyTitle") or "",
                    "storySource": "",
                    "blockType": block_type,
                    "styleName": entry.get("styleName") or "",
                    "text": entry.get("text") or "",
                })
    return blocks


def _attach_page_level_findings(page_reports, pagination_rows, spelling_issues, orthotypography_issues):
    numbering_by_page = {
        str((row or {}).get("pageName") or "").strip(): row
        for row in (pagination_rows or [])
        if str((row or {}).get("pageName") or "").strip()
    }
    spelling_by_page = {}
    orthotypography_by_page = {}
    for issue in spelling_issues or []:
        spelling_by_page.setdefault(str(issue.get("pageName") or "").strip(), []).append(issue)
    for issue in orthotypography_issues or []:
        orthotypography_by_page.setdefault(str(issue.get("pageName") or "").strip(), []).append(issue)
    for page in page_reports or []:
        page_name = str(page.get("pageName") or "").strip()
        page["numbering"] = numbering_by_page.get(page_name) or {
            "pageName": page_name,
            "ok": False,
            "message": f"La página {page_name or '?'} no tiene dato de numeración.",
        }
        page["spellingIssues"] = spelling_by_page.get(page_name, [])
        page["orthotypographyIssues"] = orthotypography_by_page.get(page_name, [])
        folio = str(((page.get("footerMarkers") or {}).get("pageNumber")) or "").strip()
        if folio:
            page["numbering"]["visiblePageNumber"] = folio
    return page_reports


def _build_document_insights(session, pages, swatches, styles, stories):
    applied_masters = sorted({
        str((page or {}).get("appliedMaster") or "").strip()
        for page in (pages or [])
        if str((page or {}).get("appliedMaster") or "").strip()
    })
    return {
        "configurationWarnings": _build_configuration_warnings(session),
        "pagePreview": _build_page_preview(pages),
        "swatchInventory": _build_swatch_inventory(swatches),
        "topParagraphStyles": _build_style_usage(stories, styles, "paragraphStyleIds", "paragraphStyles"),
        "topCharacterStyles": _build_style_usage(stories, styles, "characterStyleIds", "characterStyles"),
        "topStories": _build_story_preview(stories),
        "appliedMasters": applied_masters[:12],
        "pageReports": _build_page_reports(pages, stories, styles),
    }


def analyze_idml_document(input_path, session):
    started_at = perf_counter()
    with open_idml(input_path) as archive:
        document_summary = build_document_summary(input_path, session)
        designmap = parse_designmap(archive)
        swatches = parse_swatches(archive, designmap.get("graphicSource") or "Resources/Graphic.xml")
        styles = parse_styles(archive, designmap.get("stylesSource") or "Resources/Styles.xml")
        pages = parse_pages(archive, designmap.get("spreadSources") or None)
        master_spreads = parse_master_spreads(archive, designmap.get("masterSpreadSources") or None)
        stories = parse_stories(archive, designmap.get("storySources") or None)
        text_char_count = sum(len(entry["text"]) for entry in stories)
        pagination_rows = build_pagination_report(pages)
        pagination_issues = find_pagination_issues(pages)
        section_issues = find_section_issues(pages, stories, session)
        color_issues = find_color_issues(swatches, (((session or {}).get("colorConfig")) or {}).get("palette") or [])
        page_reports = _build_page_reports(pages, stories, styles)
        page_reports = _apply_master_content(page_reports, master_spreads, stories, styles)
        swatch_lookup = _build_swatch_lookup(swatches)
        for page in page_reports:
            page["fieldProfiles"] = _extract_field_profiles(page, swatch_lookup)
        semantic_blocks = _select_semantic_story_blocks(_build_semantic_blocks(page_reports))
        gemini_verifier = GeminiVerifier()
        spelling_issues = find_spelling_issues(semantic_blocks, gemini_verifier=gemini_verifier)
        orthotypography_issues = find_orthotypography_issues(semantic_blocks, gemini_verifier=gemini_verifier)
        page_reports = _attach_page_level_findings(page_reports, pagination_rows, spelling_issues, orthotypography_issues)
        insights = _build_document_insights(session, pages, swatches, styles, stories)
        insights["pageReports"] = page_reports

        return {
            "paginationIssues": pagination_issues,
            "sectionIssues": section_issues,
            "spellingIssues": spelling_issues,
            "orthotypographyIssues": orthotypography_issues,
            "colorIssues": color_issues,
            "stats": {
                "documentName": document_summary["name"],
                "storyCount": len(stories),
                "pageCount": len(pages),
                "paragraphStyleCount": len(styles["paragraphStyles"]),
                "characterStyleCount": len(styles["characterStyles"]),
                "usedSwatches": [entry["name"] for entry in swatches[:20]],
                "swatchCount": len(swatches),
                "textCharacterCount": text_char_count,
                "semanticStoryCount": len(semantic_blocks),
                "declaredStoryCount": len(designmap.get("storyList", [])),
                "spreadCount": len(designmap.get("spreadSources", [])),
                "masterSpreadCount": len(designmap.get("masterSpreadSources", [])),
                "sourceType": "idml",
                "geminiVerifierEnabled": bool(gemini_verifier.enabled),
                **insights,
                "durationMs": int((perf_counter() - started_at) * 1000),
            },
        }
