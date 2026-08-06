import re


BODY_STYLE_TOKENS = (
    "texto",
    "cuerpo",
    "parrafo",
    "párrafo",
    "lectura",
    "literatura",
    "respuesta alumno",
)

EXCLUDED_STYLE_TOKENS = (
    "titulo",
    "título",
    "subtitulo",
    "subtítulo",
    "folio",
    "pie de pagina",
    "pie de página",
    "pie de foto",
)


def _line_words(text=""):
    return re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+", str(text or ""))


def _is_body_text_entry(entry=None, block_type=""):
    style_name = str((entry or {}).get("styleName") or "").strip().lower()
    normalized_block_type = str(block_type or (entry or {}).get("blockType") or "").strip().lower()
    if any(token in style_name for token in EXCLUDED_STYLE_TOKENS):
        return False
    if normalized_block_type in {
        "párrafos normales",
        "parrafos normales",
        "instrucciones",
        "subinstrucciones",
    }:
        return True
    return any(token in style_name for token in BODY_STYLE_TOKENS) or len(_line_words((entry or {}).get("text"))) >= 9


def _number(value, fallback):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(fallback)


def _glyph_width_em(character=""):
    if not character:
        return 0.0
    if character.isspace():
        return 0.28
    if character in "ilIíìîï|!¡.,:;'`´’‘\"“”()[]{}":
        return 0.27
    if character in "mwMW@%&QGÓÚÜÑ":
        return 0.82
    if character.isupper():
        return 0.62
    if character.isdigit():
        return 0.55
    return 0.52


def _text_width_points(text="", point_size=12.0, tracking=0.0, horizontal_scale=100.0):
    source = str(text or "")
    if not source:
        return 0.0
    glyph_width = sum(_glyph_width_em(character) for character in source) * point_size
    tracking_width = max(0, len(source) - 1) * point_size * (tracking / 1000.0)
    return max(0.0, (glyph_width + tracking_width) * (horizontal_scale / 100.0))


def _compose_visual_lines(entry=None):
    """Return visual lines and identify how trustworthy their boundaries are.

    IDML does not serialize the soft lines produced by InDesign's paragraph
    composer. Width-based lines are useful for diagnostics, but they must never
    be presented as confirmed widow/orphan findings: OpenType shaping, kerning,
    paragraph indents, composer settings and anchored objects can all change the
    real wrap. A future InDesign/UXP extractor can provide ``composedLines`` and
    those boundaries are treated as native evidence.
    """
    native_lines = (entry or {}).get("composedLines")
    if isinstance(native_lines, (list, tuple)):
        normalized_native_lines = [
            re.sub(r"\s+", " ", str(line or "")).strip()
            for line in native_lines
            if str(line or "").strip()
        ]
        if normalized_native_lines:
            return normalized_native_lines, "idml-native-lines"

    source = str((entry or {}).get("text") or "").replace("\r", "\n")
    explicit_segments = [re.sub(r"\s+", " ", part).strip() for part in source.split("\n")]
    explicit_segments = [part for part in explicit_segments if part]
    if not explicit_segments:
        return [], ""
    composition_width = _number((entry or {}).get("compositionWidth"), 0)
    point_size = max(5.0, _number((entry or {}).get("pointSize"), 12))
    tracking = _number((entry or {}).get("tracking"), 0)
    horizontal_scale = max(25.0, _number((entry or {}).get("horizontalScale"), 100))
    if composition_width <= 0:
        return explicit_segments, "explicit-break" if len(explicit_segments) > 1 else ""

    lines = []
    for segment in explicit_segments:
        words = segment.split()
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if current and _text_width_points(candidate, point_size, tracking, horizontal_scale) > composition_width:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)
    return lines, "idml-frame-composition-estimate"


def _has_reliable_line_evidence(composition_source=""):
    """Only lines exported by InDesign may create user-visible findings.

    A paragraph return is explicit text structure, but it is not evidence that
    InDesign left a widow/orphan at a page, column or frame boundary.
    """
    return str(composition_source or "") == "idml-native-lines"


def _isolated_word_has_clear_separation(entry=None, adjacent_line="", isolated_word=""):
    """Reject metric-edge cases where the font's real glyph widths can reflow the word.

    IDML does not serialize soft line breaks. A generic metric can differ slightly
    from InDesign's actual OpenType/variable-font shaping, so an estimated widow is
    only actionable when joining it to the adjacent line exceeds the TextFrame by
    a meaningful margin.
    """
    composition_width = _number((entry or {}).get("compositionWidth"), 0)
    if composition_width <= 0:
        return True
    point_size = max(5.0, _number((entry or {}).get("pointSize"), 12))
    tracking = _number((entry or {}).get("tracking"), 0)
    horizontal_scale = max(25.0, _number((entry or {}).get("horizontalScale"), 100))
    combined = f"{str(adjacent_line or '').strip()} {str(isolated_word or '').strip()}".strip()
    combined_width = _text_width_points(combined, point_size, tracking, horizontal_scale)
    overflow = combined_width - composition_width
    uncertainty_margin = max(point_size * 1.25, composition_width * 0.08)
    return overflow > uncertainty_margin


def _build_frame_issue(entry=None, page_name="", kind="word_widow", excerpt="", composition_source=""):
    normalized_kind = str(kind or "word_widow").strip().lower()
    scope = "line" if normalized_kind.startswith("line_") else "word"
    family = "orphan" if normalized_kind.endswith("_orphan") else "widow"
    is_widow = family == "widow"
    noun = "línea" if scope == "line" else "palabra"
    adjective = "viuda" if is_widow else "huérfana"
    label = f"{noun} {adjective}"
    if scope == "line":
        location = "al inicio del marco siguiente" if is_widow else "al final del marco anterior"
        suggestion = "Recomponer los marcos enlazados para mantener al menos dos líneas del párrafo juntas."
    else:
        location = "en la última línea" if is_widow else "en la primera línea"
        suggestion = "Recomponer la caja para evitar que una sola palabra quede aislada en la línea."
    clean_excerpt = str(excerpt or "").strip()
    return {
        "pageName": str(page_name or (entry or {}).get("pageName") or "").strip(),
        "storyId": str((entry or {}).get("storyId") or "").strip(),
        "storyTitle": str((entry or {}).get("storyTitle") or "").strip(),
        "storySource": str((entry or {}).get("storySource") or "").strip(),
        "blockType": str((entry or {}).get("blockType") or "").strip(),
        "styleName": str((entry or {}).get("styleName") or "").strip(),
        "frameId": str((entry or {}).get("frameId") or "").strip(),
        "frameRect": (entry or {}).get("frameRect") or None,
        "layerId": str((entry or {}).get("layerId") or "").strip(),
        "layerName": str((entry or {}).get("layerName") or "").strip(),
        "message": (
            f"Página {page_name or '?'}: posible {label} {location} de la caja de texto. "
            f"Fragmento: \"{clean_excerpt}\"."
        ),
        "context": str((entry or {}).get("text") or "").strip(),
        "excerpt": clean_excerpt,
        "suggestion": suggestion,
        "providers": [composition_source or "idml-text-frame"],
        "layoutIssueType": normalized_kind,
        "layoutIssueFamily": family,
        "layoutIssueScope": scope,
        "code": f"text_frame_{normalized_kind}",
        "severity": "warning",
        "reason": f"Posible {label} detectada con la geometría y tipografía de TextFrame IDML.",
        "confidence": 0.9 if composition_source == "explicit-break" else 0.78,
    }


def _effective_leading(entry=None):
    point_size = max(5.0, _number((entry or {}).get("pointSize"), 12))
    leading = _number((entry or {}).get("leading"), 0)
    if leading > 0:
        return leading
    auto_leading = _number((entry or {}).get("autoLeading"), 120)
    return point_size * max(1.0, auto_leading / 100.0)


def _ordered_linked_frames(frame_records=None):
    records = [record for record in (frame_records or []) if str((record or {}).get("frameId") or "").strip()]
    by_id = {str(record.get("frameId") or "").strip(): record for record in records}
    roots = [
        record for record in records
        if not str(record.get("previousTextFrame") or "").strip()
        or str(record.get("previousTextFrame") or "").strip() not in by_id
    ]
    roots.sort(key=lambda record: (int(record.get("pageSequence") or 0), str(record.get("frameId") or "")))
    ordered = []
    seen = set()
    for root in roots + records:
        current = root
        while current:
            frame_id = str(current.get("frameId") or "").strip()
            if not frame_id or frame_id in seen:
                break
            seen.add(frame_id)
            ordered.append(current)
            current = by_id.get(str(current.get("nextTextFrame") or "").strip())
    return ordered


def _find_linked_frame_layout_issues(page_reports=None, max_issues=20):
    """Compose linked stories independently with every TextFrame's own geometry."""
    frames_by_story = {}
    entries_by_story = {}
    for page in page_reports or []:
        page_name = str((page or {}).get("pageName") or "").strip()
        page_sequence = int((page or {}).get("pageSequence") or 0)
        for frame in (page or {}).get("storyRefs") or []:
            story_id = str((frame or {}).get("storyId") or "").strip()
            if not story_id:
                continue
            frames_by_story.setdefault(story_id, []).append({
                **(frame or {}),
                "pageName": page_name,
                "pageSequence": page_sequence,
            })
        for block_type, entries in ((page or {}).get("content") or {}).items():
            for entry in entries or []:
                story_id = str((entry or {}).get("storyId") or "").strip()
                if not story_id or not _is_body_text_entry(entry, block_type):
                    continue
                signature = (
                    int((entry or {}).get("blockOrder") or 0),
                    str((entry or {}).get("text") or "").strip(),
                )
                entries_by_story.setdefault(story_id, {}).setdefault(signature, entry)

    issues = []
    seen = set()

    def append_issue(story_id, paragraph, issue_frame, issue_kind, excerpt):
        signature = (
            story_id,
            int(paragraph.get("blockOrder") or 0),
            issue_kind,
            str(issue_frame.get("frameId") or ""),
            str(excerpt or "").lower(),
        )
        if signature in seen:
            return False
        seen.add(signature)
        issue_entry = {
            **paragraph,
            **issue_frame,
            "text": paragraph.get("text") or "",
        }
        issue = _build_frame_issue(
            issue_entry,
            issue_frame.get("pageName") or "",
            issue_kind,
            excerpt,
            "idml-linked-text-frame-composition",
        )
        issue["confidence"] = 0.72 if issue_kind.startswith("line_") else 0.76
        issues.append(issue)
        return len(issues) >= max_issues

    for story_id, paragraph_map in entries_by_story.items():
        frames = _ordered_linked_frames(frames_by_story.get(story_id) or [])
        if len(frames) < 2 or not any(str(frame.get("nextTextFrame") or "").strip() for frame in frames):
            continue
        # TextFrame geometry alone cannot reveal which soft lines InDesign placed
        # in each linked frame. Do not manufacture line widows/orphans by replaying
        # the story with generic glyph widths.
        if not all(isinstance(frame.get("composedLines"), (list, tuple)) for frame in frames):
            continue
        paragraphs = [paragraph_map[key] for key in sorted(paragraph_map, key=lambda value: (value[0], value[1]))]
        frame_index = 0
        remaining_height = _number(frames[0].get("compositionHeight"), 0)
        for paragraph in paragraphs:
            if frame_index >= len(frames):
                break
            leading = _effective_leading(paragraph)
            space_before = max(0.0, _number(paragraph.get("spaceBefore"), 0))
            space_after = max(0.0, _number(paragraph.get("spaceAfter"), 0))
            remaining_words = str(paragraph.get("text") or "").replace("\r", " ").replace("\n", " ").split()
            if not remaining_words:
                continue
            remaining_height = max(0.0, remaining_height - space_before)
            paragraph_started = False
            while remaining_words and frame_index < len(frames):
                active_frame = frames[frame_index]
                if remaining_height <= 0:
                    remaining_height = _number(active_frame.get("compositionHeight"), 0)
                capacity = int(remaining_height // leading) if leading > 0 else 0
                if capacity <= 0:
                    frame_index += 1
                    if frame_index < len(frames):
                        remaining_height = _number(frames[frame_index].get("compositionHeight"), 0)
                    continue
                frame_entry = {
                    **paragraph,
                    **active_frame,
                    "text": " ".join(remaining_words),
                    "compositionWidth": active_frame.get("compositionWidth") or paragraph.get("compositionWidth"),
                }
                lines, composition_source = _compose_visual_lines(frame_entry)
                if not lines:
                    break
                if not _has_reliable_line_evidence(composition_source):
                    break
                take = min(capacity, len(lines))
                segment = lines[:take]
                consumed_words = sum(len(str(line or "").split()) for line in segment)
                if consumed_words <= 0:
                    break
                split_after = consumed_words < len(remaining_words)
                segment_word_counts = [len(_line_words(line)) for line in segment]

                if not paragraph_started and split_after and take == 1:
                    if append_issue(story_id, paragraph, active_frame, "line_orphan", segment[0]):
                        return issues
                if paragraph_started and not split_after and take == 1:
                    if append_issue(story_id, paragraph, active_frame, "line_widow", segment[0]):
                        return issues
                if (
                    not split_after
                    and len(segment) >= 2
                    and segment_word_counts[-1] == 1
                    and segment_word_counts[-2] >= 4
                    and (
                        composition_source == "explicit-break"
                        or not bool(frame_entry.get("noBreakLastWord"))
                    )
                    and (
                        composition_source == "explicit-break"
                        or _isolated_word_has_clear_separation(frame_entry, segment[-2], segment[-1])
                    )
                ):
                    if append_issue(story_id, paragraph, active_frame, "word_widow", segment[-1]):
                        return issues
                if (
                    not paragraph_started
                    and len(segment) >= 2
                    and segment_word_counts[0] == 1
                    and segment_word_counts[1] >= 4
                    and (
                        composition_source == "explicit-break"
                        or _isolated_word_has_clear_separation(frame_entry, segment[0], segment[1])
                    )
                ):
                    if append_issue(story_id, paragraph, active_frame, "word_orphan", segment[0]):
                        return issues
                paragraph_started = True
                remaining_words = remaining_words[consumed_words:]
                remaining_height = max(0.0, remaining_height - (take * leading))
                if split_after:
                    frame_index += 1
                    if frame_index < len(frames):
                        remaining_height = _number(frames[frame_index].get("compositionHeight"), 0)
            if frame_index < len(frames):
                remaining_height = max(0.0, remaining_height - space_after)
    return issues


def find_text_frame_widow_orphan_issues(page_reports=None, max_issues=20):
    """Detecta líneas aisladas usando saltos y geometría extraídos del TextFrame IDML."""
    issues = []
    seen = set()
    frame_ids_by_story = {}
    for page in page_reports or []:
        for frame in (page or {}).get("storyRefs") or []:
            story_id = str((frame or {}).get("storyId") or "").strip()
            frame_id = str((frame or {}).get("frameId") or "").strip()
            if story_id and frame_id:
                frame_ids_by_story.setdefault(story_id, set()).add(frame_id)
    for page in page_reports or []:
        page_name = str((page or {}).get("pageName") or "").strip()
        for block_type, entries in ((page or {}).get("content") or {}).items():
            for entry in entries or []:
                if not (entry or {}).get("frameRect") or not _is_body_text_entry(entry, block_type):
                    continue
                story_id = str((entry or {}).get("storyId") or "").strip()
                # A multi-frame story must be composed by the linked-frame path;
                # using the representative frame selected for page reporting can
                # apply the wrong width to the paragraph.
                if story_id and len(frame_ids_by_story.get(story_id) or set()) > 1:
                    continue
                lines, composition_source = _compose_visual_lines(entry)
                if len(lines) < 2:
                    continue
                if not _has_reliable_line_evidence(composition_source):
                    continue
                line_word_counts = [len(_line_words(line)) for line in lines]
                if sum(line_word_counts) < 9:
                    continue
                candidates = []
                if (
                    line_word_counts[-1] == 1
                    and line_word_counts[-2] >= 4
                    and (
                        composition_source == "explicit-break"
                        or not bool((entry or {}).get("noBreakLastWord"))
                    )
                    and (
                        composition_source == "explicit-break"
                        or _isolated_word_has_clear_separation(entry, lines[-2], lines[-1])
                    )
                ):
                    candidates.append(("word_widow", lines[-1]))
                if (
                    line_word_counts[0] == 1
                    and line_word_counts[1] >= 4
                    and (
                        composition_source == "explicit-break"
                        or _isolated_word_has_clear_separation(entry, lines[0], lines[1])
                    )
                ):
                    candidates.append(("word_orphan", lines[0]))
                for kind, excerpt in candidates:
                    signature = (
                        page_name,
                        str((entry or {}).get("frameId") or ""),
                        str((entry or {}).get("storyId") or ""),
                        kind,
                        excerpt.lower(),
                    )
                    if signature in seen:
                        continue
                    seen.add(signature)
                    issues.append(_build_frame_issue(entry, page_name, kind, excerpt, composition_source))
                    if len(issues) >= max_issues:
                        return issues
    if len(issues) < max_issues:
        issues.extend(_find_linked_frame_layout_issues(page_reports, max_issues=max_issues - len(issues)))
    return issues
