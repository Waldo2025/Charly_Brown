import base64
import io
import re
from PIL import Image

from .stories import _normalize_object_style_name
from .gemini_verifier import GeminiVerifier
from .pipeline import (
    _normalize_story_text,
    _has_alias_style,
    _iter_page_bucket_items,
    _is_first_grade_session,
    _normalize_unidad,
    _extract_video_titles,
    _extract_destination_page_labels,
    _origins_match_destination_labels,
    _resolve_active_analysis_revision,
    _resolve_active_recortable_role,
    _resolve_item_text_with_story_context,
)

LINKED_ASSET_TYPES = (
    ("recortable", "recortable", "Recortable", "Recortables"),
    ("ficha", "ficha", "Ficha", "Fichas"),
    ("anexo", "anexo", "Anexo", "Anexos"),
    ("video", "video", "Video", "Videos"),
)

FIRST_GRADE_GEMINI_VISUAL_KINDS = {"recortable", "anexo", "ficha", "video"}
INVALID_LINKED_ASSET_CODES = {
    "aqui",
    "aquí",
    "aqu",
    "de",
    "del",
    "el",
    "la",
    "las",
    "los",
    "nivel",
    "trimestre",
    "unidad",
    "unidades",
    "digital",
    "pagina",
    "página",
    "pag",
    "pág",
    "competencia",
    "descriptiva",
    "descriptivo",
    "trabajo",
}


def _is_valid_linked_asset_code(kind="", code=""):
    raw_kind = str(kind or "").strip().lower()
    raw_code = str(code or "").strip()
    if not raw_kind or not raw_code:
        return False
    if raw_code.lower() in INVALID_LINKED_ASSET_CODES:
        return False
    if raw_kind in {"recortable", "anexo", "ficha"}:
        return any(character.isdigit() for character in raw_code)
    return True


def _crop_story_preview(preview=None, page_rect=None, frame_rect=None):
    preview = preview or {}
    image_base64 = str(preview.get("base64") or "").strip()
    if not image_base64 or not page_rect or not frame_rect:
        return {}
    try:
        image_bytes = base64.b64decode(image_base64)
        with Image.open(io.BytesIO(image_bytes)) as image:
            width, height = image.size
            page_x1 = float(page_rect.get("x1"))
            page_y1 = float(page_rect.get("y1"))
            page_x2 = float(page_rect.get("x2"))
            page_y2 = float(page_rect.get("y2"))
            frame_x1 = float(frame_rect.get("x1"))
            frame_y1 = float(frame_rect.get("y1"))
            frame_x2 = float(frame_rect.get("x2"))
            frame_y2 = float(frame_rect.get("y2"))
            page_w = max(1.0, page_x2 - page_x1)
            page_h = max(1.0, page_y2 - page_y1)
            crop_x1 = max(page_x1, frame_x1 - (page_w * 0.015))
            crop_x2 = min(page_x2, frame_x2 + (page_w * 0.015))
            crop_y1 = max(page_y1, frame_y1 - (page_h * 0.015))
            frame_h = max(1.0, frame_y2 - frame_y1)
            crop_y2 = min(page_y2, frame_y1 + min(frame_h, page_h * 0.22))

            left = int(max(0, min(width - 1, ((crop_x1 - page_x1) / page_w) * width)))
            top = int(max(0, min(height - 1, ((crop_y1 - page_y1) / page_h) * height)))
            right = int(max(left + 1, min(width, ((crop_x2 - page_x1) / page_w) * width)))
            bottom = int(max(top + 1, min(height, ((crop_y2 - page_y1) / page_h) * height)))

            cropped = image.crop((left, top, right, bottom))
            buffer = io.BytesIO()
            cropped.save(buffer, format="PNG")
            return {
                "mimeType": "image/png",
                "base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
            }
    except Exception:
        return {}


def _extract_linked_asset_mentions(text, allowed_types=None):
    import re

    source = str(text or "").strip()
    if not source:
        return []
    allowed = {
        str(value or "").strip().lower()
        for value in (allowed_types or [entry[0] for entry in LINKED_ASSET_TYPES])
        if str(value or "").strip()
    }
    code_allowed = [entry for entry in LINKED_ASSET_TYPES if entry[0] in allowed and entry[0] != "video"]
    type_pattern = "|".join(re.escape(entry[1]) for entry in code_allowed)
    seen = set()
    mentions = []
    if "video" in allowed:
        for title in _extract_video_titles(source):
            key = f"video:{title.lower()}"
            if key in seen:
                continue
            seen.add(key)
            mentions.append({
                "kind": "video",
                "code": title,
                "label": title,
            })
    if not type_pattern:
        return mentions
    pattern = rf"\b({type_pattern})s?\s+([A-Za-z0-9]+)(?:\s*[\"“”'']([^\"“”'']{{3,140}})[\"“”'']|\s+«([^»]{{3,140}})»)?"
    for match in re.finditer(pattern, source, flags=re.IGNORECASE):
        raw_type = match.group(1)
        raw_code = match.group(2)
        kind = str(raw_type or "").strip().lower()
        code = str(raw_code or "").strip()
        if not _is_valid_linked_asset_code(kind, code):
            continue
        key = f"{kind}:{code.lower()}"
        if kind and code and key not in seen:
            seen.add(key)
            label_prefix = next((entry[2] for entry in LINKED_ASSET_TYPES if entry[0] == kind), kind.title())
            mention = {
                "kind": kind,
                "code": code,
                "label": f"{label_prefix} {code}",
            }
            raw_title = str(match.group(3) or match.group(4) or "").strip()
            clean_title = " ".join(raw_title.split()).strip(" .,:;")
            if clean_title:
                mention["title"] = clean_title
            mentions.append(mention)
    return mentions


def _extract_recortable_codes(text):
    return [entry["code"] for entry in _extract_linked_asset_mentions(text, allowed_types=["recortable"])]


def _extract_recortable_fallback_codes(text):
    import re

    source = str(text or "").strip()
    if not source:
        return []
    matches = re.findall(r"\b(?:[A-Za-z]{1,3}T\d+|\d+[A-Za-z])\b", source, flags=re.IGNORECASE)
    seen = set()
    codes = []
    for match in matches:
        clean = str(match or "").strip()
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            codes.append(clean)
    return codes


def _extract_visual_recortable_codes(text):
    import re

    source = str(text or "").strip()
    if not source:
        return []
    matches = re.findall(r"\b(?:\d+[A-Za-z]T\d+|[A-Za-z]\d+T\d+)\b", source, flags=re.IGNORECASE)
    seen = set()
    codes = []
    for match in matches:
        clean = str(match or "").strip()
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            codes.append(clean)
    return codes


def _normalize_visual_code(code=""):
    import re

    raw = str(code or "").strip()
    if not raw:
        return ""
    match = re.search(r"\b(?:\d+[A-Za-z]T\d+|[A-Za-z]\d+T\d+)\b", raw, flags=re.IGNORECASE)
    return str(match.group(0)).strip() if match else ""


def _normalize_visual_reference(kind="", code="", title="", fallback_text=""):
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind == "video":
        title_candidates = []
        raw_title = " ".join(str(title or "").split()).strip(" .,:;")
        if raw_title:
            title_candidates.append(raw_title)
        title_candidates.extend(_extract_video_titles(fallback_text))
        seen = set()
        titles = []
        for candidate in title_candidates:
            key = candidate.lower()
            if candidate and key not in seen:
                seen.add(key)
                titles.append(candidate)
        return titles
    normalized_code = _normalize_visual_code(code)
    if normalized_code:
        return [normalized_code]
    return _extract_visual_recortable_codes(fallback_text)


def _extract_story_inline_asset_detections(story=None):
    import re

    tokens = list((story or {}).get("flowTokens") or [])
    if not tokens:
        return []
    detections = []
    code_pattern = re.compile(r"\b(?:\d+[A-Za-z]T\d+|[A-Za-z]\d+T\d+)\b", flags=re.IGNORECASE)
    for index, token in enumerate(tokens):
        if token.get("type") != "text":
            continue
        text = str(token.get("text") or "")
        for match in code_pattern.finditer(text):
            code = str(match.group(0) or "").strip()
            if not code:
                continue
            icon_kind = ""
            icon_distance_ok = False
            for lookback in range(index - 1, max(-1, index - 4), -1):
                previous = tokens[lookback]
                if previous.get("type") == "icon":
                    icon_kind = str(previous.get("iconKind") or "").strip().lower()
                    icon_distance_ok = match.start() <= 24
                    break
                previous_text = str(previous.get("text") or "")
                if previous_text and previous_text.strip() and len(previous_text.strip()) > 3:
                    break
            if icon_kind and icon_distance_ok:
                detections.append({
                    "kind": icon_kind,
                    "codes": [code],
                    "reason": "story-inline-icon",
                })
    return _dedupe_visual_detections(detections)


def _dedupe_visual_detections(detections=None):
    seen = set()
    deduped = []
    for item in detections or []:
      kind = str((item or {}).get("kind") or "").strip().lower()
      codes = [str(value or "").strip() for value in ((item or {}).get("codes") or []) if str(value or "").strip()]
      reason = str((item or {}).get("reason") or "").strip()
      if not kind or not codes:
          continue
      unique_codes = []
      local_seen = set()
      for code in codes:
          code_key = code.lower()
          if code_key in local_seen:
              continue
          local_seen.add(code_key)
          unique_codes.append(code)
      if not unique_codes:
          continue
      key = f"{kind}:{'|'.join(code.lower() for code in unique_codes)}"
      if key in seen:
          continue
      seen.add(key)
      deduped.append({
          "kind": kind,
          "codes": unique_codes,
          "reason": reason,
      })
    return deduped


def _page_has_instructional_content(page):
    for bucket_name in ("instrucciones", "subinstrucciones"):
        if (page.get("content") or {}).get(bucket_name):
            return True
    return False


def _classify_visual_linked_asset_kind(page):
    items = page.get("pageItems") or []
    page_rect = page.get("pageRect") or {}
    try:
        x1 = float(page_rect.get("x1"))
        x2 = float(page_rect.get("x2"))
        y1 = float(page_rect.get("y1"))
        y2 = float(page_rect.get("y2"))
    except (TypeError, ValueError):
        return ""
    page_width = max(1.0, x2 - x1)
    page_height = max(1.0, y2 - y1)
    outer_edge = "left" if abs(x1) > abs(x2) else "right"
    edge_margin = max(72.0, page_width * 0.12)
    top_limit = y1 + (page_height * 0.34)

    def is_outer_edge_item(rect):
        if not rect:
            return False
        if outer_edge == "left":
            return float(rect.get("x1", 10**9)) <= (x1 + edge_margin)
        return float(rect.get("x2", -10**9)) >= (x2 - edge_margin)

    has_edge_inline_icon = False
    has_edge_panel_marker = False
    has_edge_video_marker = False
    for item in items:
        style_name = _normalize_object_style_name(item.get("appliedObjectStyle") or "")
        rect = item.get("frameRect") or {}
        center_y = (float(rect.get("y1", 0)) + float(rect.get("y2", 0))) / 2 if rect else 0
        if center_y > top_limit:
            continue
        if "ICONOS INLINE" in style_name and is_outer_edge_item(rect):
            has_edge_inline_icon = True
        if "PERSIANA TABLERO" in style_name and is_outer_edge_item(rect):
            has_edge_panel_marker = True
        if "VIDEO" in style_name and is_outer_edge_item(rect):
            has_edge_video_marker = True
        if "CUTOUTS LINE" in style_name:
            has_edge_panel_marker = True
    if has_edge_video_marker:
        return "video"
    if has_edge_panel_marker and _page_has_instructional_content(page):
        return "recortable"
    if has_edge_inline_icon:
        return "anexo"
    return ""


def _detect_visual_linked_asset_with_gemini(page, session=None, gemini_verifier=None, story_preview_index=None):
    if not gemini_verifier or not gemini_verifier.enabled:
        return {}
    candidates = []
    for bucket_name in ("instrucciones", "subinstrucciones"):
        for item in ((page.get("content") or {}).get(bucket_name) or []):
            story_id = str(item.get("storyId") or "").strip()
            candidates.append({
                "storyId": story_id,
                "text": str(item.get("text") or "").strip(),
                "story": (story_preview_index or {}).get(story_id) or {},
                "frameRect": item.get("frameRect") or None,
            })
    for candidate in candidates:
        story = candidate.get("story") or {}
        inline_detections = _extract_story_inline_asset_detections(story)
        if inline_detections:
            return {"detections": inline_detections}
        preview = (story.get("previewImage") or {}) if isinstance(story, dict) else {}
        if not preview.get("base64"):
            continue
        cropped_preview = _crop_story_preview(
            preview,
            page.get("pageRect") or None,
            candidate.get("frameRect") or None,
        ) or preview or {}
        result = gemini_verifier.classify_linked_asset_visual(
            page_name=page.get("pageName") or "",
            image_base64=cropped_preview.get("base64") or "",
            mime_type=cropped_preview.get("mimeType") or "image/jpeg",
        )
        detections = []
        for asset in (result.get("assets") or []):
            kind = str((asset or {}).get("kind") or "").strip().lower()
            if not kind or kind == "unknown" or kind not in FIRST_GRADE_GEMINI_VISUAL_KINDS:
                continue
            references = _normalize_visual_reference(
                kind=kind,
                code=(asset or {}).get("code") or "",
                title=(asset or {}).get("title") or "",
                fallback_text=candidate.get("text") or "",
            )
            if not references:
                continue
            detections.append({
                "kind": kind,
                "codes": references,
                "reason": str((asset or {}).get("reason") or "").strip(),
            })
        detections = _dedupe_visual_detections(detections)
        if detections:
            return {"detections": detections}
    return {}


def _build_external_asset_destination_index(session=None):
    destination_index = {}
    for revision in ((session or {}).get("revisions") or []):
        unidad = _normalize_unidad((revision or {}).get("unidad") or "")
        linked_kind = ""
        if unidad == "recortables":
            linked_kind = "recortable"
        elif unidad == "fichas":
            linked_kind = "ficha"
        elif unidad == "anexos":
            linked_kind = "anexo"
        if not linked_kind:
            continue
        if linked_kind == "recortable":
            role = str((revision or {}).get("recortableRole") or "").strip().lower()
            role = role if role in {"source", "destination", "both"} else "source"
            if role not in {"destination", "both"}:
                continue
        linked_file_label = str((revision or {}).get("title") or unidad.title()).strip() or unidad.title()
        for file_entry in ((revision or {}).get("files") or []):
            result = (file_entry or {}).get("result") or {}
            stats = result.get("stats") or {}
            for page in (stats.get("pageReports") or []):
                page_name = str((page or {}).get("pageName") or "").strip()
                if not page_name:
                    continue
                text_fragments = []
                summary = (page or {}).get("recortableSummary") or {}
                resolved_from_summary = []
                for entry in (summary.get("resolvedDestinations") or []):
                    code_label = str((entry or {}).get("code") or "").strip()
                    destination_label = str((entry or {}).get("destination") or "").strip()
                    if code_label and destination_label:
                        resolved_from_summary.append((code_label, destination_label))
                for code_label, destination_label in resolved_from_summary:
                    for mention in _extract_linked_asset_mentions(code_label, allowed_types=[linked_kind]):
                        key = f"{linked_kind}:{mention['code'].lower()}"
                        destination_index.setdefault(key, [])
                        dedupe_key = f"{destination_label}::{str((file_entry or {}).get('documentName') or linked_file_label).strip() or linked_file_label}"
                        existing_targets = {
                            f"{str((entry or {}).get('pageName') or '').strip()}::{str((entry or {}).get('fileTitle') or '').strip()}"
                            for entry in destination_index[key]
                        }
                        if dedupe_key not in existing_targets:
                            destination_index[key].append({
                                "kind": linked_kind,
                                "code": mention["code"],
                                "label": mention["label"],
                                "pageName": destination_label,
                                "fileTitle": str((file_entry or {}).get("documentName") or linked_file_label).strip() or linked_file_label,
                                "revisionTitle": linked_file_label,
                                "sourcePageName": page_name,
                            })
                footer_title = str((((page or {}).get("footerMarkers") or {}).get("sectionTitle")) or "").strip()
                if footer_title:
                    text_fragments.append(footer_title)
                for item in _iter_page_bucket_items(page, include_master=True):
                    text = str((item or {}).get("text") or "").strip()
                    if text:
                        text_fragments.append(text)
                page_targets = []
                seen_page_targets = set()
                for fragment in text_fragments:
                    declared_pages = _extract_destination_page_labels(fragment)
                    for declared_page in declared_pages:
                        if declared_page in seen_page_targets:
                            continue
                        seen_page_targets.add(declared_page)
                        page_targets.append(declared_page)
                aggregated = " ".join(text_fragments)
                mentions = _extract_linked_asset_mentions(aggregated, allowed_types=[linked_kind])
                for mention in mentions:
                    key = f"{linked_kind}:{mention['code'].lower()}"
                    target_pages = page_targets or [page_name]
                    destination_index.setdefault(key, [])
                    existing_targets = {
                        f"{str((entry or {}).get('pageName') or '').strip()}::{str((entry or {}).get('fileTitle') or '').strip()}"
                        for entry in destination_index[key]
                    }
                    for target_page in target_pages:
                        dedupe_key = f"{target_page}::{str((file_entry or {}).get('documentName') or linked_file_label).strip() or linked_file_label}"
                        if dedupe_key in existing_targets:
                            continue
                        existing_targets.add(dedupe_key)
                        destination_index[key].append({
                            "kind": linked_kind,
                            "code": mention["code"],
                            "label": mention["label"],
                            "pageName": target_page,
                            "fileTitle": str((file_entry or {}).get("documentName") or linked_file_label).strip() or linked_file_label,
                            "revisionTitle": linked_file_label,
                            "sourcePageName": page_name,
                        })
    return destination_index


def _build_external_asset_origin_index(session=None):
    origin_index = {}
    active_revision = _resolve_active_analysis_revision(session)
    active_revision_id = str((active_revision or {}).get("id") or "").strip()
    for revision in ((session or {}).get("revisions") or []):
        revision_id = str((revision or {}).get("id") or "").strip()
        if active_revision_id and revision_id == active_revision_id:
            continue
        unidad = _normalize_unidad((revision or {}).get("unidad") or "")
        if unidad == "recortables":
            role = str((revision or {}).get("recortableRole") or "").strip().lower()
            role = role if role in {"source", "destination", "both"} else "source"
            if role == "destination":
                continue
        revision_title = str((revision or {}).get("title") or unidad.title()).strip() or unidad.title()
        for file_entry in ((revision or {}).get("files") or []):
            result = (file_entry or {}).get("result") or {}
            stats = result.get("stats") or {}
            for page in (stats.get("pageReports") or []):
                page_name = str((page or {}).get("pageName") or "").strip()
                if not page_name:
                    continue
                summary = (page or {}).get("recortableSummary") or {}
                for code_label in (summary.get("originCodes") or []):
                    for mention in _extract_linked_asset_mentions(code_label, allowed_types=["recortable", "ficha", "anexo", "video"]):
                        key = f"{mention['kind']}:{mention['code'].lower()}"
                        origin_index.setdefault(key, [])
                        origin_index[key].append({
                            "kind": mention["kind"],
                            "code": mention["code"],
                            "label": mention["label"],
                            "pageName": page_name,
                            "fileTitle": str((file_entry or {}).get("documentName") or revision_title).strip() or revision_title,
                            "revisionTitle": revision_title,
                        })
    return origin_index


def _page_has_instructional_content(page):
    for bucket_name in ("instrucciones", "subinstrucciones"):
        if (page.get("content") or {}).get(bucket_name):
            return True
    return False


def _classify_visual_linked_asset_kind(page):
    items = page.get("pageItems") or []
    page_rect = page.get("pageRect") or {}
    try:
        x1 = float(page_rect.get("x1"))
        x2 = float(page_rect.get("x2"))
        y1 = float(page_rect.get("y1"))
        y2 = float(page_rect.get("y2"))
    except (TypeError, ValueError):
        return ""
    page_width = max(1.0, x2 - x1)
    page_height = max(1.0, y2 - y1)
    outer_edge = "left" if abs(x1) > abs(x2) else "right"
    edge_margin = max(72.0, page_width * 0.12)
    top_limit = y1 + (page_height * 0.34)

    def is_outer_edge_item(rect):
        if not rect:
            return False
        if outer_edge == "left":
            return float(rect.get("x1", 10**9)) <= (x1 + edge_margin)
        return float(rect.get("x2", -10**9)) >= (x2 - edge_margin)

    has_edge_inline_icon = False
    has_edge_panel_marker = False
    has_edge_video_marker = False
    for item in items:
        style_name = _normalize_object_style_name(item.get("appliedObjectStyle") or "")
        rect = item.get("frameRect") or {}
        center_y = (float(rect.get("y1", 0)) + float(rect.get("y2", 0))) / 2 if rect else 0
        if center_y > top_limit:
            continue
        if "ICONOS INLINE" in style_name and is_outer_edge_item(rect):
            has_edge_inline_icon = True
        if "PERSIANA TABLERO" in style_name and is_outer_edge_item(rect):
            has_edge_panel_marker = True
        if "VIDEO" in style_name and is_outer_edge_item(rect):
            has_edge_video_marker = True
        if "CUTOUTS LINE" in style_name:
            has_edge_panel_marker = True
    if has_edge_video_marker:
        return "video"
    if has_edge_panel_marker and _page_has_instructional_content(page):
        return "recortable"
    if has_edge_inline_icon:
        return "anexo"
    return ""


def _detect_visual_linked_asset_with_gemini(page, session=None, gemini_verifier=None, story_preview_index=None):
    if not gemini_verifier or not gemini_verifier.enabled:
        return {}
    candidates = []
    for bucket_name in ("instrucciones", "subinstrucciones"):
        for item in ((page.get("content") or {}).get(bucket_name) or []):
            story_id = str(item.get("storyId") or "").strip()
            candidates.append({
                "storyId": story_id,
                "text": str(item.get("text") or "").strip(),
                "story": (story_preview_index or {}).get(story_id) or {},
                "frameRect": item.get("frameRect") or None,
            })
    for candidate in candidates:
        story = candidate.get("story") or {}
        inline_detections = _extract_story_inline_asset_detections(story)
        if inline_detections:
            return {"detections": inline_detections}
        preview = (story.get("previewImage") or {}) if isinstance(story, dict) else {}
        if not preview.get("base64"):
            continue
        cropped_preview = _crop_story_preview(
            preview,
            page.get("pageRect") or None,
            candidate.get("frameRect") or None,
        ) or preview or {}
        result = gemini_verifier.classify_linked_asset_visual(
            page_name=page.get("pageName") or "",
            image_base64=cropped_preview.get("base64") or "",
            mime_type=cropped_preview.get("mimeType") or "image/jpeg",
        )
        detections = []
        for asset in (result.get("assets") or []):
            kind = str((asset or {}).get("kind") or "").strip().lower()
            if not kind or kind == "unknown" or kind not in FIRST_GRADE_GEMINI_VISUAL_KINDS:
                continue
            references = _normalize_visual_reference(
                kind=kind,
                code=(asset or {}).get("code") or "",
                title=(asset or {}).get("title") or "",
                fallback_text=candidate.get("text") or "",
            )
            if not references:
                continue
            detections.append({
                "kind": kind,
                "codes": references,
                "reason": str((asset or {}).get("reason") or "").strip(),
            })
        detections = _dedupe_visual_detections(detections)
        if detections:
            return {"detections": detections}
    return {}


def _build_recortable_checks(page_reports, alias_index=None, session=None, gemini_verifier=None, story_preview_index=None):
    code_index = {}
    global_issues = []
    ignored_styles = {
        "08_05_02 HABILIDADES",
    }
    active_revision = _resolve_active_analysis_revision(session)
    current_unidad = _normalize_unidad((active_revision or {}).get("unidad") or ((((session or {}).get("bibliographicInfo")) or {}).get("unidad") or ""))
    current_recortable_role = _resolve_active_recortable_role(session)
    is_destination_only_recortable = current_unidad == "recortables" and current_recortable_role == "destination"
    is_linked_asset_destination_revision = current_unidad in {"anexos", "fichas"} or (
        current_unidad == "recortables" and current_recortable_role in {"destination", "both"}
    )
    external_destination_index = _build_external_asset_destination_index(session)
    external_origin_index = _build_external_asset_origin_index(session)
    pages_by_name = {
        str((page or {}).get("pageName") or "").strip(): page
        for page in (page_reports or [])
        if str((page or {}).get("pageName") or "").strip()
    }

    for page in page_reports or []:
        page["recortableIssues"] = []
        page["recortableSummary"] = {
            "originIndicator": False,
            "visualIndicator": False,
            "visualKind": "",
            "codes": [],
            "originCodes": [],
            "destinationCodes": [],
            "codeTitles": {},
            "pendingDestinations": [],
            "resolvedDestinations": [],
            "resolvedLinks": [],
            "hasError": False,
        }

        page_codes = []
        origin_indicator = False
        destination_codes = []
        page_text_fragments = []
        destination_text_fragments = []
        page_mentions = []
        destination_links = []
        code_titles = {}
        def remember_code_title(mention):
            label = str((mention or {}).get("label") or "").strip()
            title = str((mention or {}).get("title") or "").strip()
            if label and title:
                code_titles[label] = title
        for item in _iter_page_bucket_items(page, include_master=False):
            text = _resolve_item_text_with_story_context(item, story_preview_index=story_preview_index)
            if not text:
                continue
            style_name = str(item.get("styleName") or "").strip().upper()
            if style_name in ignored_styles:
                continue
            page_text_fragments.append(text)
            if (_has_alias_style(alias_index, "recortable_indicator", "paragraph", style_name) or style_name == "08_01_COMPETENCIA") and "recortable" in _normalize_story_text(text):
                origin_indicator = True
            is_destination_style = (
                _has_alias_style(alias_index, "recortable_destination", "paragraph", style_name)
                or style_name == "01_00_TITULO LITERATURAS Y EJERCICIOS"
            )
            if is_linked_asset_destination_revision and is_destination_style:
                destination_text_fragments.append(text)
            mentions = _extract_linked_asset_mentions(text)
            declared_destination_pages = _extract_destination_page_labels(text)
            for mention in mentions:
                remember_code_title(mention)
                page_mentions.append(mention)
                page_label = mention["label"]
                if page_label.lower() not in {value.lower() for value in page_codes}:
                    page_codes.append(page_label)
                entry_key = f"{mention['kind']}:{mention['code'].lower()}"
                entry = code_index.setdefault(entry_key, {
                    "kind": mention["kind"],
                    "code": mention["code"],
                    "label": mention["label"],
                    "origins": set(),
                    "destinations": set(),
                    "externalDestinations": [],
                    "destinationHasFooter": {},
                })
                if is_linked_asset_destination_revision and is_destination_style:
                    destination_codes.append(page_label)
                    entry["destinations"].add(str(page.get("pageName") or "").strip())
                    entry["destinationHasFooter"][str(page.get("pageName") or "").strip()] = bool((page.get("footerMarkers") or {}).get("footerRecortable"))
                if is_linked_asset_destination_revision:
                    if page_label.lower() not in {value.lower() for value in destination_codes}:
                        destination_codes.append(page_label)
                    target_pages = declared_destination_pages or [str(page.get("pageName") or "").strip()]
                    for declared_page in [value for value in target_pages if str(value or "").strip()]:
                        destination_links.append({
                            "code": page_label,
                            "destination": declared_page,
                        })

        aggregated_page_text = " ".join(page_text_fragments)
        aggregated_destination_text = " ".join(destination_text_fragments)
        visual_origin_codes = []
        textual_origin_indicator = origin_indicator
        explicit_mentions = _extract_linked_asset_mentions(aggregated_page_text)
        for mention in explicit_mentions:
            remember_code_title(mention)
            if mention["label"].lower() not in {value.lower() for value in page_codes}:
                page_codes.append(mention["label"])
        for mention in _extract_linked_asset_mentions(aggregated_destination_text):
            remember_code_title(mention)
            if mention["label"].lower() not in {value.lower() for value in destination_codes}:
                destination_codes.append(mention["label"])
            entry_key = f"{mention['kind']}:{mention['code'].lower()}"
            entry = code_index.setdefault(entry_key, {
                "kind": mention["kind"],
                "code": mention["code"],
                "label": mention["label"],
                "origins": set(),
                "destinations": set(),
                "externalDestinations": [],
                "destinationHasFooter": {},
            })
            entry["destinations"].add(str(page.get("pageName") or "").strip())
            entry["destinationHasFooter"][str(page.get("pageName") or "").strip()] = bool((page.get("footerMarkers") or {}).get("footerRecortable"))

        visual_detection = {}
        visual_detections = []
        if not origin_indicator and not explicit_mentions:
            visual_detection = _detect_visual_linked_asset_with_gemini(
                page,
                session=session,
                gemini_verifier=gemini_verifier,
                story_preview_index=story_preview_index,
            )
            visual_detections = _dedupe_visual_detections(visual_detection.get("detections") or [])
            if not visual_detections:
                visual_kind = str(visual_detection.get("kind") or "").strip().lower()
            else:
                visual_kind = ""
            if not visual_kind and not visual_detections:
                visual_kind = _classify_visual_linked_asset_kind(page)
                if visual_kind not in FIRST_GRADE_GEMINI_VISUAL_KINDS:
                    visual_kind = ""
                if visual_kind:
                    visual_detections = _dedupe_visual_detections([{
                        "kind": visual_kind,
                        "codes": _normalize_visual_reference(
                            kind=visual_kind,
                            fallback_text=aggregated_page_text,
                        ),
                    }])
        if not origin_indicator and visual_detections:
            visual_origin_codes = [
                str(value or "").strip()
                for detection in visual_detections
                for value in (detection.get("codes") or [])
                if str(value or "").strip()
            ]
            if visual_origin_codes:
                origin_indicator = True
                page["recortableSummary"]["visualIndicator"] = True
                page["recortableSummary"]["originIndicator"] = True
                visual_kinds = sorted({str((item or {}).get("kind") or "").strip().lower() for item in visual_detections if str((item or {}).get("kind") or "").strip()})
                page["recortableSummary"]["visualKind"] = ", ".join(visual_kinds)
                for detection in visual_detections:
                    visual_kind = str(detection.get("kind") or "recortable").strip().lower() or "recortable"
                    label_prefix = next((entry[2] for entry in LINKED_ASSET_TYPES if entry[0] == visual_kind), visual_kind.title())
                    for code in [str(value or "").strip() for value in (detection.get("codes") or []) if str(value or "").strip()]:
                        label = code if visual_kind == "video" else f"{label_prefix} {code}"
                        if label.lower() not in {value.lower() for value in page_codes}:
                            page_codes.append(label)
                        entry_key = f"{visual_kind}:{code.lower()}"
                        entry = code_index.setdefault(entry_key, {
                            "kind": visual_kind,
                            "code": code,
                            "label": label,
                            "origins": set(),
                            "destinations": set(),
                            "externalDestinations": [],
                            "destinationHasFooter": {},
                        })
                        entry["origins"].add(str(page.get("pageName") or "").strip())

        if explicit_mentions:
            for mention in explicit_mentions:
                remember_code_title(mention)
                if is_destination_only_recortable:
                    continue
                entry_key = f"{mention['kind']}:{mention['code'].lower()}"
                entry = code_index.setdefault(entry_key, {
                    "kind": mention["kind"],
                    "code": mention["code"],
                    "label": mention["label"],
                    "origins": set(),
                    "destinations": set(),
                    "externalDestinations": [],
                    "destinationHasFooter": {},
                })
                entry["origins"].add(str(page.get("pageName") or "").strip())
        if textual_origin_indicator and not is_destination_only_recortable:
            page["recortableSummary"]["originIndicator"] = True
            fallback_codes = _extract_recortable_fallback_codes(aggregated_page_text)
            for code in fallback_codes:
                label = f"Recortable {code}"
                if label.lower() not in {value.lower() for value in page_codes}:
                    page_codes.append(label)
                entry_key = f"recortable:{code.lower()}"
                entry = code_index.setdefault(entry_key, {
                    "kind": "recortable",
                    "code": code,
                    "label": label,
                    "origins": set(),
                    "destinations": set(),
                    "externalDestinations": [],
                    "destinationHasFooter": {},
                })
                entry["origins"].add(str(page.get("pageName") or "").strip())
            if not page_codes and current_unidad == "proyecto":
                page["recortableIssues"].append({
                    "pageName": page.get("pageName") or "",
                    "message": f'Página {page.get("pageName") or "?"}: el bloque de recortable mapeado no tiene referencia completa dentro del texto.',
                    "severity": "error",
                })

        page["recortableSummary"]["codes"] = page_codes
        page["recortableSummary"]["originCodes"] = [] if is_destination_only_recortable else (page_codes if (origin_indicator or explicit_mentions) else [])
        page["recortableSummary"]["destinationCodes"] = destination_codes
        page["recortableSummary"]["codeTitles"] = code_titles
        seen_destination_pairs = set()
        for destination_link in destination_links:
            code_label = str(destination_link.get("code") or "").strip()
            destination_label = str(destination_link.get("destination") or "").strip()
            dedupe_key = f"{code_label.lower()}::{destination_label}"
            if not code_label or not destination_label or dedupe_key in seen_destination_pairs:
                continue
            seen_destination_pairs.add(dedupe_key)
            matching_origins = []
            for mention in _extract_linked_asset_mentions(code_label, allowed_types=["recortable", "ficha", "anexo", "video"]):
                origin_key = f"{mention['kind']}:{mention['code'].lower()}"
                matching_origins.extend(external_origin_index.get(origin_key) or [])
            matching_origin_pages = [
                str((item or {}).get("pageName") or "").strip()
                for item in matching_origins
                if str((item or {}).get("pageName") or "").strip()
            ]
            is_same_kind_destination_code_match = any(
                str((item or {}).get("kind") or "").strip().lower() == mention["kind"]
                for item in matching_origins
            )
            is_match = bool(matching_origins) if is_same_kind_destination_code_match else _origins_match_destination_labels(matching_origin_pages, [destination_label])
            page["recortableSummary"]["resolvedDestinations"].append({
                "code": code_label,
                "kind": mention["kind"],
                "destination": destination_label,
                "status": "match" if is_match else ("mismatch" if matching_origin_pages else "pending"),
            })
            page["recortableSummary"]["resolvedLinks"].append({
                "code": code_label,
                "kind": mention["kind"],
                "role": "destination",
                "origins": matching_origin_pages,
                "destination": destination_label,
                "status": "match" if is_match else ("mismatch" if matching_origin_pages else "pending"),
            })
            if matching_origin_pages and not is_match:
                page["recortableIssues"].append({
                    "pageName": page.get("pageName") or "",
                    "code": code_label,
                    "message": f"{code_label}: destino declarado pág. {destination_label} no coincide con el origen detectado en pág. {', pág. '.join(matching_origin_pages)}.",
                    "severity": "error",
                })

    for key, entry in code_index.items():
        code = entry["code"]
        kind = entry.get("kind") or "recortable"
        label = entry.get("label") or (code if kind == "video" else f"{kind.title()} {code}")
        pretty_kind = next((item[2] for item in LINKED_ASSET_TYPES if item[0] == kind), kind.title())
        origins = sorted(page for page in entry["origins"] if page)
        destinations = sorted(page for page in entry["destinations"] if page)
        external_destinations = entry.get("externalDestinations") or external_destination_index.get(key) or []
        if not destinations and external_destinations:
            if not origins:
                continue
            deduped_external_destinations = []
            seen_external_destinations = set()
            for target in external_destinations:
                dedupe_key = f"{str((target or {}).get('pageName') or '').strip()}::{str((target or {}).get('fileTitle') or '').strip()}::{str((target or {}).get('sourcePageName') or '').strip()}"
                if dedupe_key in seen_external_destinations:
                    continue
                seen_external_destinations.add(dedupe_key)
                deduped_external_destinations.append(target)
            external_destinations = deduped_external_destinations
            external_pages = [str((target or {}).get("pageName") or "").strip() for target in external_destinations if str((target or {}).get("pageName") or "").strip()]
            subject = label if kind == "video" else f"{pretty_kind} {code}"
            is_external_code_match = bool(external_destinations)
            if is_external_code_match or _origins_match_destination_labels(origins, external_pages):
                if len(external_destinations) == 1:
                    target = external_destinations[0]
                    destination_text = f"{target.get('fileTitle') or pretty_kind} · pág. {target.get('pageName') or '?'}"
                    if str(target.get("sourcePageName") or "").strip():
                        destination_text = f"{destination_text} (archivo pág. {target.get('sourcePageName')})"
                    message = f"{subject}. Origen: pág. {', pág. '.join(origins)}. Destino declarado: {destination_text}."
                else:
                    message = f"{subject}. Origen: pág. {', pág. '.join(origins)}. Destino declarado: pág. {', pág. '.join(external_pages)}."
                global_issues.append({
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": True,
                    "origins": origins,
                    "destination": ", ".join(external_pages),
                    "message": message,
                })
                for page_name in origins:
                    page = pages_by_name.get(page_name)
                    if page:
                        for target in external_destinations:
                            destination_text = f"{target.get('fileTitle') or pretty_kind} · pág. {target.get('pageName') or '?'}"
                            if str(target.get("sourcePageName") or "").strip():
                                destination_text = f"{destination_text} (archivo pág. {target.get('sourcePageName')})"
                            page["recortableSummary"]["resolvedDestinations"].append({
                                "code": label,
                                "kind": kind,
                                "destination": destination_text,
                                "status": "match",
                            })
                            page["recortableSummary"]["resolvedLinks"].append({
                                "code": label,
                                "kind": kind,
                                "role": "origin",
                                "origins": origins,
                                "destination": destination_text,
                                "status": "match",
                            })
                continue
            issue = {
                "code": code,
                "label": label,
                "kind": kind,
                "ok": False,
                "origins": origins,
                "destinations": external_pages,
                "message": f"{subject}: origen en pág. {', pág. '.join(origins)} y destino declarado en Recortables pág. {', pág. '.join(external_pages) or '?'}, no hacen match.",
            }
            global_issues.append(issue)
            for page_name in origins:
                page = pages_by_name.get(page_name)
                if page:
                    page["recortableIssues"].append({
                        "pageName": page_name,
                        "code": label,
                        "message": issue["message"],
                        "severity": "error",
                    })
            continue
        if kind == "recortable" and origins and len(destinations) == 1:
            destination = destinations[0]
            has_footer = bool(entry["destinationHasFooter"].get(destination))
            if has_footer:
                subject = label if kind == "video" else f"{pretty_kind} {code}"
                global_issues.append({
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": True,
                    "origins": origins,
                    "destination": destination,
                    "message": f"{subject}. Origen: pág. {', pág. '.join(origins)}. Destino: pág. {destination}.",
                })
                for page_name in origins:
                    page = pages_by_name.get(page_name)
                    if page:
                        page["recortableSummary"]["resolvedDestinations"].append({
                            "code": label,
                            "kind": kind,
                            "destination": destination,
                            "status": "match",
                        })
                        page["recortableSummary"]["resolvedLinks"].append({
                            "code": label,
                            "kind": kind,
                            "role": "origin",
                            "origins": origins,
                            "destination": destination,
                            "status": "match",
                        })
                destination_page = pages_by_name.get(destination)
                if destination_page:
                    destination_page["recortableSummary"]["resolvedDestinations"].append({
                        "code": label,
                        "kind": kind,
                        "destination": destination,
                        "status": "match",
                    })
                    destination_page["recortableSummary"]["resolvedLinks"].append({
                        "code": label,
                        "kind": kind,
                        "role": "destination",
                        "origins": origins,
                        "destination": destination,
                        "status": "match",
                    })
                continue

        if origins and not destinations:
            if current_unidad not in {"proyecto", "recortables", "fichas", "anexos"}:
                issue = {
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": False,
                    "pending": True,
                    "origins": origins,
                    "destination": "",
                    "message": f"{pretty_kind} {code}: destino pendiente para la sesión actual.",
                }
                global_issues.append(issue)
                for page_name in origins:
                    page = pages_by_name.get(page_name)
                    if page:
                        page["recortableIssues"].append({
                            "pageName": page_name,
                            "code": label,
                            "message": issue["message"],
                            "severity": "pending",
                        })
                        page["recortableSummary"]["pendingDestinations"].append({
                            "code": label,
                            "kind": kind,
                            "destinationLabel": "pendiente",
                        })
                continue
            subject = label if kind == "video" else f"{pretty_kind} {code}"
            issue = {
                "code": code,
                "label": label,
                "kind": kind,
                "ok": False,
                "origins": origins,
                "destination": "",
                "message": f"{subject}: se detectó en origen (pág. {', pág. '.join(origins)}) pero no tiene página destino disponible.",
            }
            global_issues.append(issue)
            for page_name in origins:
                page = pages_by_name.get(page_name)
                if page:
                    page["recortableIssues"].append({
                        "pageName": page_name,
                        "code": label,
                        "message": issue["message"],
                        "severity": "error",
                    })
            continue

        if len(destinations) > 1:
            subject = label if kind == "video" else f"{pretty_kind} {code}"
            issue = {
                "code": code,
                "label": label,
                "kind": kind,
                "ok": False,
                "origins": origins,
                "destinations": destinations,
                "message": f"{subject}: tiene múltiples páginas destino ({', '.join(f'pág. {page}' for page in destinations)}).",
            }
            global_issues.append(issue)
            for page_name in set(origins + destinations):
                page = pages_by_name.get(page_name)
                if page:
                    page["recortableIssues"].append({
                        "pageName": page_name,
                        "code": label,
                        "message": issue["message"],
                        "severity": "error",
                    })
            continue

        if not origins and destinations:
            if is_destination_only_recortable:
                continue
            subject = label if kind == "video" else f"{pretty_kind} {code}"
            issue = {
                "code": code,
                "label": label,
                "kind": kind,
                "ok": False,
                "origins": [],
                "destination": destinations[0] if len(destinations) == 1 else "",
                "message": f"{subject}: existe página destino (pág. {', pág. '.join(destinations)}) pero no se encontró página origen.",
            }
            global_issues.append(issue)
            for page_name in destinations:
                page = pages_by_name.get(page_name)
                if page:
                    page["recortableIssues"].append({
                        "pageName": page_name,
                        "code": label,
                        "message": issue["message"],
                        "severity": "error",
                    })
            continue

        if kind == "recortable" and origins and len(destinations) == 1 and not is_destination_only_recortable:
            destination = destinations[0]
            if not entry["destinationHasFooter"].get(destination):
                issue = {
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": False,
                    "origins": origins,
                    "destination": destination,
                    "message": f"Recortable {code}: la página destino pág. {destination} no contiene 'recortable' en 12_01 PIE DE PAGINA DERCHO.",
                }
                global_issues.append(issue)
                for page_name in origins + [destination]:
                    page = pages_by_name.get(page_name)
                    if page:
                        page["recortableIssues"].append({
                            "pageName": page_name,
                            "code": label,
                            "message": issue["message"],
                            "severity": "error",
                        })

    for page in page_reports or []:
        page["recortableSummary"]["hasError"] = any(
            str((issue or {}).get("severity") or "").strip().lower() == "error"
            for issue in (page.get("recortableIssues") or [])
        )
    return global_issues, page_reports
