import base64
import io
import re

from PIL import Image, ImageDraw

from .pages import _get_accumulated_transform, _get_text_frame_rect, _normalize_color_ref
from .styles import local_name, parse_xml

AUTO_PAGE_NUMBER_TOKEN = "__AUTO_PAGE_NUMBER__"
INLINE_OBJECT_TOKEN = "\uFFFC"
INLINE_OBJECT_TAGS = {"Group", "Polygon", "Rectangle", "Oval", "GraphicLine", "TextFrame"}


def _is_decorative_character_style(style_id=""):
    normalized = str(style_id or "").strip().lower()
    if not normalized:
        return False
    return any(token in normalized for token in ("windings", "wingdings", "webdings"))


def _normalize_text_fragments(fragments):
    pieces = []
    for raw_fragment in fragments:
        if raw_fragment is None:
            continue
        fragment = str(raw_fragment)
        if not fragment:
            continue
        if fragment == "\n":
            if pieces and not pieces[-1].endswith("\n"):
                pieces.append("\n")
            continue
        pieces.append(fragment)

    joined = "".join(pieces).replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = []
    for fragment in joined.split("\n"):
        clean = re.sub(r"[ \t]+", " ", fragment).strip()
        if clean:
            paragraphs.append(clean)
        elif paragraphs and paragraphs[-1] != "":
            paragraphs.append("")
    return "\n".join(paragraphs).strip()


def _find_ancestor(node, parent_map, predicate):
    current = parent_map.get(node)
    while current is not None:
        if predicate(current):
            return current
        current = parent_map.get(current)
    return None


def _is_inside_note(node, parent_map):
    return _find_ancestor(node, parent_map, lambda current: local_name(current.tag) == "Note") is not None


def _deleted_change_ancestor(node, parent_map):
    return _find_ancestor(
        node,
        parent_map,
        lambda current: local_name(current.tag) == "Change"
        and str(current.get("ChangeType") or "").strip() == "DeletedText",
    )


def _is_inside_table(node, parent_map):
    return _find_ancestor(
        node,
        parent_map,
        lambda current: local_name(current.tag) in {"Table", "Cell"},
    ) is not None


def _extract_text_from_node(node, *, stop_nested_paragraph_ranges=True, preserve_inline_objects=False):
    fragments = []

    def walk(current, *, is_root=False, decorative_context=False):
        tag = local_name(current.tag)
        if stop_nested_paragraph_ranges and not is_root and tag == "ParagraphStyleRange":
            return
        if preserve_inline_objects and not is_root and tag in INLINE_OBJECT_TAGS:
            fragments.append(INLINE_OBJECT_TOKEN)
            return
        next_decorative_context = decorative_context
        if tag == "CharacterStyleRange":
            next_decorative_context = decorative_context or _is_decorative_character_style(
                current.get("AppliedCharacterStyle", "")
            )
        if tag == "Content" and current.text:
            if next_decorative_context:
                return
            fragments.append(current.text)
            return
        if tag == "Br":
            fragments.append("\n")
            return
        for child in list(current):
            walk(child, is_root=False, decorative_context=next_decorative_context)

    walk(node, is_root=True)
    return _normalize_text_fragments(fragments)


def _extract_preview_image(raw_xml):
    if not raw_xml:
        return None
    format_match = re.search(r"<xmpGImg:format>([^<]+)</xmpGImg:format>", raw_xml, flags=re.IGNORECASE)
    image_match = re.search(r"<xmpGImg:image>(.*?)</xmpGImg:image>", raw_xml, flags=re.IGNORECASE | re.DOTALL)
    if not image_match:
        return None
    image_data = re.sub(r"\s+", "", image_match.group(1) or "").strip()
    if not image_data:
        return None
    raw_format = str((format_match.group(1) if format_match else "") or "").strip().lower()
    mime_type = {
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(raw_format, "image/jpeg")
    return {
        "mimeType": mime_type,
        "base64": image_data,
    }


def _normalize_object_style_name(value=""):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "/" in raw:
        raw = raw.split("/", 1)[-1]
    return raw.strip().upper()


def _parse_anchor_pair(value=""):
    parts = str(value or "").strip().split()
    if len(parts) != 2:
        return None
    try:
        return float(parts[0]), float(parts[1])
    except (TypeError, ValueError):
        return None


def _collect_shape_bounds(node, parent_map=None):
    points = []
    transform = _get_accumulated_transform(node, parent_map)
    tx = float((transform or [0, 0, 0, 0, 0, 0])[4] or 0)
    ty = float((transform or [0, 0, 0, 0, 0, 0])[5] or 0)
    for descendant in node.iter():
        if local_name(descendant.tag) != "PathPointType":
            continue
        point = _parse_anchor_pair(descendant.get("Anchor", ""))
        if point is not None:
            points.append((point[0] + tx, point[1] + ty))
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return {
        "x1": min(xs),
        "y1": min(ys),
        "x2": max(xs),
        "y2": max(ys),
    }


def _node_style_color(value="", *, fallback="#1f2937", paper="#ffffff"):
    normalized = str(value or "").strip().lower()
    if not normalized or normalized.endswith("/none"):
        return None
    if normalized.endswith("/paper"):
        return paper
    return fallback


def _render_icon_preview(node, parent_map=None):
    if node is None:
        return None
    renderables = []
    for descendant in node.iter():
        tag = local_name(descendant.tag)
        if tag not in {"Oval", "Rectangle", "Polygon", "TextFrame"}:
            continue
        bounds = _collect_shape_bounds(descendant, parent_map)
        if not bounds:
            continue
        renderables.append({
            "tag": tag,
            "bounds": bounds,
            "fill": _node_style_color(descendant.get("FillColor", ""), fallback="#334155", paper="#ffffff"),
            "stroke": _node_style_color(descendant.get("StrokeColor", ""), fallback="#0f172a", paper="#ffffff"),
            "strokeWeight": max(1.0, float(descendant.get("StrokeWeight", "1") or "1")),
        })
    if not renderables:
        return None

    x1 = min(item["bounds"]["x1"] for item in renderables)
    y1 = min(item["bounds"]["y1"] for item in renderables)
    x2 = max(item["bounds"]["x2"] for item in renderables)
    y2 = max(item["bounds"]["y2"] for item in renderables)
    width = max(1.0, x2 - x1)
    height = max(1.0, y2 - y1)
    padding = 8
    target_size = 192
    scale = min(target_size / width, target_size / height)
    scale = max(2.0, min(scale, 10.0))
    canvas_w = int((width * scale) + (padding * 2))
    canvas_h = int((height * scale) + (padding * 2))
    image = Image.new("RGB", (canvas_w, canvas_h), "#ffffff")
    draw = ImageDraw.Draw(image)

    def map_bounds(bounds):
        return (
            padding + ((bounds["x1"] - x1) * scale),
            padding + ((bounds["y1"] - y1) * scale),
            padding + ((bounds["x2"] - x1) * scale),
            padding + ((bounds["y2"] - y1) * scale),
        )

    for item in renderables:
        left, top, right, bottom = map_bounds(item["bounds"])
        stroke_width = max(1, int(round(item["strokeWeight"] * scale * 0.18)))
        fill = item["fill"]
        outline = item["stroke"]
        if item["tag"] == "Oval":
            draw.ellipse((left, top, right, bottom), fill=fill, outline=outline, width=stroke_width)
        elif item["tag"] == "Polygon":
            draw.rectangle((left, top, right, bottom), fill=fill, outline=outline, width=stroke_width)
        else:
            draw.rounded_rectangle((left, top, right, bottom), radius=max(2, int(4 * scale * 0.25)), fill=fill, outline=outline, width=stroke_width)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return {
        "mimeType": "image/png",
        "base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
    }


def _find_instruction_icon_preview_node(node, parent_map):
    parent = parent_map.get(node)
    if parent is not None:
        current_style = _normalize_object_style_name(node.get("AppliedObjectStyle", ""))
        for sibling in list(parent):
            if sibling is node or local_name(sibling.tag) != "Group":
                continue
            sibling_style = _normalize_object_style_name(sibling.get("AppliedObjectStyle", ""))
            if sibling_style != current_style:
                continue
            if any(local_name(desc.tag) in {"Oval", "Rectangle", "Polygon", "GraphicLine"} for desc in sibling.iter()):
                return sibling
    current = node
    while current is not None:
        style_name = _normalize_object_style_name(current.get("AppliedObjectStyle", ""))
        if local_name(current.tag) == "Group" and "ICONOS INLINE" in style_name:
            return current
        current = parent_map.get(current)
    return node


def _normalize_inline_icon_kind(node):
    tag = local_name(node.tag)
    style_name = str(node.get("AppliedObjectStyle") or "").strip().upper()
    if "ICONOS INLINE" not in style_name:
        return ""
    direct_child_tags = [local_name(child.tag) for child in list(node)]
    if tag == "Polygon":
        return "anexo"
    if tag == "Group" and "Rectangle" in direct_child_tags:
        return "recortable"
    return ""


def _collect_story_flow_tokens(node, tokens, decorative_context=False):
    for child in list(node):
        tag = local_name(child.tag)
        next_decorative_context = decorative_context
        if tag == "CharacterStyleRange":
            next_decorative_context = decorative_context or _is_decorative_character_style(
                child.get("AppliedCharacterStyle", "")
            )
        if tag == "Content" and child.text:
            if next_decorative_context:
                continue
            tokens.append({
                "type": "text",
                "text": str(child.text or ""),
            })
            continue
        if tag == "Br":
            tokens.append({
                "type": "text",
                "text": "\n",
            })
            continue
        if tag in {"Group", "Polygon", "Rectangle", "Oval", "GraphicLine"}:
            icon_kind = _normalize_inline_icon_kind(child)
            if icon_kind:
                tokens.append({
                    "type": "icon",
                    "iconKind": icon_kind,
                    "itemId": str(child.get("Self") or "").strip(),
                })
                continue
        _collect_story_flow_tokens(child, tokens, next_decorative_context)


def _extract_story_flow_tokens(root):
    story = next((node for node in root.iter() if local_name(node.tag) == "Story" and node.get("Self")), None)
    if story is None:
        return []
    raw_tokens = []
    _collect_story_flow_tokens(story, raw_tokens)
    tokens = []
    for token in raw_tokens:
        if token.get("type") != "text":
            tokens.append(token)
            continue
        text = str(token.get("text") or "")
        if tokens and tokens[-1].get("type") == "text":
            tokens[-1]["text"] = f"{tokens[-1].get('text') or ''}{text}"
        else:
            tokens.append({
                "type": "text",
                "text": text,
            })
    return tokens


def _extract_embedded_story_ids(root):
    story_ids = []
    seen = set()
    for node in root.iter():
        if local_name(node.tag) != "TextFrame":
            continue
        story_id = str(node.get("ParentStory") or "").strip()
        if not story_id or story_id in seen:
            continue
        seen.add(story_id)
        story_ids.append(story_id)
    return story_ids


def _extract_story_notes(root):
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    notes = []
    for node in root.iter():
        if local_name(node.tag) != "Note":
            continue
        in_change = False
        change_type = ""
        current = parent_map.get(node)
        while current is not None:
            if local_name(current.tag) == "Change":
                in_change = True
                change_type = str(current.get("ChangeType") or "").strip()
                break
            current = parent_map.get(current)
        text = _extract_text_from_node(node, stop_nested_paragraph_ranges=False)
        notes.append({
            "text": text,
            "userName": str(node.get("UserName") or "").strip(),
            "creationDate": str(node.get("CreationDate") or "").strip(),
            "modificationDate": str(node.get("ModificationDate") or "").strip(),
            "collapsed": str(node.get("Collapsed") or "").strip().lower() == "true",
            "inChange": in_change,
            "changeType": change_type,
        })
    active = []
    history = []
    for item in notes:
        if not str(item.get("text") or "").strip():
            continue
        active.append(item)
    return {
        "active": active,
        "history": history,
    }


def _extract_story_changes(root):
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    changes = []
    for index, node in enumerate(item for item in root.iter() if local_name(item.tag) == "Change"):
        text_parts = []
        for descendant in node.iter():
            if local_name(descendant.tag) != "Content" or not descendant.text:
                continue
            if _is_inside_note(descendant, parent_map):
                continue
            text_parts.append(descendant.text)
        text = _normalize_text_fragments(text_parts)
        changes.append({
            "id": str(node.get("Self") or f"change_{index + 1}").strip(),
            "changeType": str(node.get("ChangeType") or "").strip(),
            "text": text,
            "userName": str(node.get("UserName") or node.get("AppliedBy") or "").strip(),
            "date": str(node.get("Date") or node.get("ChangeDate") or "").strip(),
            "appliedDocumentUser": str(node.get("AppliedDocumentUser") or "").strip(),
        })
    return changes


def parse_stories(archive, story_sources=None):
    sources = story_sources or [
        name
        for name in archive.namelist()
        if name.startswith("Stories/Story_") and name.endswith(".xml")
    ]

    stories = []
    for member_name in sources:
        raw_xml = archive.read(member_name).decode("utf-8", "ignore")
        root = parse_xml(archive, member_name)
        story = next((node for node in root.iter() if local_name(node.tag) == "Story" and node.get("Self")), None)
        if story is None:
            continue

        content_fragments = []
        paragraph_style_ids = []
        character_style_ids = []
        paragraph_blocks = []
        embedded_story_refs = []
        embedded_story_ref_signatures = set()
        parent_map = {child: parent for parent in root.iter() for child in list(parent)}
        preview_cache = {}

        paragraph_block_index = 0
        for node in root.iter():
            tag = local_name(node.tag)
            if tag == "Content" and node.text:
                if _is_inside_note(node, parent_map) or _deleted_change_ancestor(node, parent_map):
                    continue
                current = parent_map.get(node)
                decorative_context = False
                while current is not None:
                    if local_name(current.tag) == "CharacterStyleRange" and _is_decorative_character_style(
                        current.get("AppliedCharacterStyle", "")
                    ):
                        decorative_context = True
                        break
                    current = parent_map.get(current)
                if decorative_context:
                    continue
                content_fragments.append(node.text)
            elif tag == "ParagraphStyleRange":
                if _is_inside_note(node, parent_map) or _deleted_change_ancestor(node, parent_map):
                    continue
                paragraph_style_id = node.get("AppliedParagraphStyle", "")
                paragraph_style_ids.append(paragraph_style_id)
                block_character_styles = []
                for descendant in node.iter():
                    if local_name(descendant.tag) == "CharacterStyleRange":
                        style_id = descendant.get("AppliedCharacterStyle", "")
                        if style_id:
                            block_character_styles.append(style_id)
                paragraph_text = _extract_text_from_node(node, preserve_inline_objects=True)
                is_folio_block = any(
                    value in {"CharacterStyle/Z_FOLIOS", "CharacterStyle/Z_FOLIOS RECORTABLES"}
                    for value in block_character_styles
                ) or "FOLIO" in str(paragraph_style_id or "").upper()
                if not paragraph_text and is_folio_block and "<?ACE " in raw_xml:
                    paragraph_text = AUTO_PAGE_NUMBER_TOKEN
                if paragraph_text:
                    paragraph_blocks.append({
                        "blockOrder": paragraph_block_index,
                        "paragraphStyleId": paragraph_style_id,
                        "characterStyleIds": [value for value in block_character_styles if value],
                        "text": paragraph_text,
                        "inlineObjectCount": paragraph_text.count(INLINE_OBJECT_TOKEN),
                        "inTable": _is_inside_table(node, parent_map),
                    })
                    paragraph_block_index += 1
                anchor_block_order = paragraph_block_index if paragraph_text else max(paragraph_block_index - 1, 0)
                for descendant in node.iter():
                    if local_name(descendant.tag) != "TextFrame":
                        continue
                    embedded_story_id = str(descendant.get("ParentStory") or "").strip()
                    embedded_frame_id = str(descendant.get("Self") or "").strip()
                    if not embedded_story_id or not embedded_frame_id:
                        continue
                    signature = (embedded_story_id, embedded_frame_id)
                    if signature in embedded_story_ref_signatures:
                        continue
                    embedded_story_ref_signatures.add(signature)
                    preview_node = _find_instruction_icon_preview_node(descendant, parent_map)
                    preview_key = str(preview_node.get("Self") or embedded_frame_id or embedded_story_id).strip()
                    preview_image = preview_cache.get(preview_key)
                    if preview_image is None:
                        preview_image = _render_icon_preview(preview_node, parent_map)
                        preview_cache[preview_key] = preview_image
                    embedded_story_refs.append(
                        {
                            "storyId": embedded_story_id,
                            "frameId": embedded_frame_id,
                            "appliedObjectStyle": descendant.get("AppliedObjectStyle", ""),
                            "fillColor": _normalize_color_ref(descendant.get("FillColor", "")),
                            "strokeColor": _normalize_color_ref(descendant.get("StrokeColor", "")),
                            "frameRect": _get_text_frame_rect(descendant, parent_map),
                            "overflows": str(descendant.get("Overflows", "")).strip().lower() == "true",
                            "anchorBlockOrder": anchor_block_order,
                            "anchorParentStoryId": story.get("Self", ""),
                            "previewImage": preview_image,
                        }
                    )
            elif tag == "CharacterStyleRange":
                character_style_ids.append(node.get("AppliedCharacterStyle", ""))

        stories.append(
            {
                "storyId": story.get("Self", ""),
                "storyTitle": story.get("StoryTitle", ""),
                "storySource": member_name,
                "previewImage": _extract_preview_image(raw_xml),
                "flowTokens": _extract_story_flow_tokens(root),
                "embeddedStoryIds": _extract_embedded_story_ids(root),
                "embeddedStoryRefs": embedded_story_refs,
                "notes": _extract_story_notes(root),
                "trackedChanges": _extract_story_changes(root),
                "paragraphStyleIds": [value for value in paragraph_style_ids if value],
                "characterStyleIds": [value for value in character_style_ids if value],
                "paragraphBlocks": paragraph_blocks,
                "text": _normalize_text_fragments(content_fragments),
            }
        )

    return stories
