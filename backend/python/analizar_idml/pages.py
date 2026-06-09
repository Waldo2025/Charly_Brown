from .styles import local_name, parse_xml


def _parse_transform(value):
    parts = [segment for segment in str(value or "").split() if segment]
    if len(parts) != 6:
        return None
    try:
        return [float(segment) for segment in parts]
    except (TypeError, ValueError):
        return None


def _identity_transform():
    return [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]


def _multiply_transforms(a, b):
    left = list(a or _identity_transform())
    right = list(b or _identity_transform())
    return [
        (left[0] * right[0]) + (left[2] * right[1]),
        (left[1] * right[0]) + (left[3] * right[1]),
        (left[0] * right[2]) + (left[2] * right[3]),
        (left[1] * right[2]) + (left[3] * right[3]),
        (left[0] * right[4]) + (left[2] * right[5]) + left[4],
        (left[1] * right[4]) + (left[3] * right[5]) + left[5],
    ]


def _get_accumulated_transform(node, parent_map=None):
    current = node
    transforms = []
    while current is not None:
        tag = local_name(current.tag)
        if tag in {"Spread", "MasterSpread"}:
            break
        parsed = _parse_transform(current.get("ItemTransform", ""))
        if parsed:
            transforms.append(parsed)
        current = (parent_map or {}).get(current)
    result = _identity_transform()
    for transform in reversed(transforms):
        result = _multiply_transforms(result, transform)
    return result


def _parse_geometric_bounds(value):
    parts = [segment for segment in str(value or "").split() if segment]
    if len(parts) != 4:
        return None
    try:
        top, left, bottom, right = [float(segment) for segment in parts]
        return {
            "top": top,
            "left": left,
            "bottom": bottom,
            "right": right,
            "width": right - left,
            "height": bottom - top,
        }
    except (TypeError, ValueError):
        return None


def _get_page_rect(page):
    transform = _parse_transform(page.get("ItemTransform", ""))
    bounds = _parse_geometric_bounds(page.get("GeometricBounds", ""))
    if not transform or not bounds:
        return None
    x = transform[4] + bounds["left"]
    y = transform[5] + bounds["top"]
    return {
        "x1": x,
        "y1": y,
        "x2": x + bounds["width"],
        "y2": y + bounds["height"],
    }


def _get_path_rect(node, parent_map=None):
    transform = _get_accumulated_transform(node, parent_map)
    if not transform:
        return None
    anchors = []
    for descendant in node.iter():
        if local_name(descendant.tag) != "PathPointType":
            continue
        parts = [segment for segment in str(descendant.get("Anchor", "")).split() if segment]
        if len(parts) != 2:
            continue
        try:
            x, y = float(parts[0]), float(parts[1])
        except (TypeError, ValueError):
            continue
        anchors.append((x + transform[4], y + transform[5]))
    if not anchors:
        return None
    xs = [point[0] for point in anchors]
    ys = [point[1] for point in anchors]
    return {
        "x1": min(xs),
        "y1": min(ys),
        "x2": max(xs),
        "y2": max(ys),
    }


def _get_transform_bounds_rect(node, parent_map=None):
    transform = _get_accumulated_transform(node, parent_map)
    bounds = _parse_geometric_bounds(node.get("GeometricBounds", ""))
    if not transform or not bounds:
        return None
    x = transform[4] + bounds["left"]
    y = transform[5] + bounds["top"]
    return {
        "x1": x,
        "y1": y,
        "x2": x + bounds["width"],
        "y2": y + bounds["height"],
    }


def _get_text_frame_rect(node, parent_map=None):
    return _get_path_rect(node, parent_map) or _get_transform_bounds_rect(node, parent_map)


def _rects_intersect(a, b):
    if not a or not b:
        return False
    return not (
        a["x2"] <= b["x1"]
        or a["x1"] >= b["x2"]
        or a["y2"] <= b["y1"]
        or a["y1"] >= b["y2"]
    )


def _rect_fits_inside(inner, outer):
    if not inner or not outer:
        return False
    return (
        inner["x1"] >= outer["x1"]
        and inner["x2"] <= outer["x2"]
        and inner["y1"] >= outer["y1"]
        and inner["y2"] <= outer["y2"]
    )


def _point_in_rect(x, y, rect):
    if rect is None:
        return False
    return rect["x1"] <= x <= rect["x2"] and rect["y1"] <= y <= rect["y2"]


def _classify_text_frame_status(frame_rect, page_rect, overflows=False):
    # Adobe expone overset real mediante TextFrame.overflows; la geometría del marco
    # respecto a la página es una señal distinta y no debe mezclarse con "desbordado".
    if overflows:
        return "desbordado"
    if not frame_rect or not page_rect:
        return "correcto"
    if _rect_fits_inside(frame_rect, page_rect):
        return "correcto"
    if not _rects_intersect(frame_rect, page_rect):
        return "fuera de la página"
    center_x = (frame_rect["x1"] + frame_rect["x2"]) / 2
    center_y = (frame_rect["y1"] + frame_rect["y2"]) / 2
    if _point_in_rect(center_x, center_y, page_rect):
        return "parcialmente fuera de la página"
    return "fuera de la página"


def _resolve_page_for_rect(frame_rect, page_entries):
    if not frame_rect:
        return None
    center_x = (frame_rect["x1"] + frame_rect["x2"]) / 2
    center_y = (frame_rect["y1"] + frame_rect["y2"]) / 2
    for page in page_entries:
        rect = page.get("_rect")
        if not rect:
            continue
        if rect["x1"] <= center_x <= rect["x2"] and rect["y1"] <= center_y <= rect["y2"]:
            return page
    if not page_entries:
        return None
    return min(
        page_entries,
        key=lambda page: abs((((page.get("_rect") or {}).get("x1", 0) + ((page.get("_rect") or {}).get("x2", 0))) / 2) - center_x),
    )


def _normalize_color_ref(value=""):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "/" in raw:
        return raw.split("/", 1)[-1]
    return raw


def _build_page_item_record(node, item_kind, rect):
    return {
        "itemId": node.get("Self", ""),
        "itemKind": item_kind,
        "appliedObjectStyle": node.get("AppliedObjectStyle", ""),
        "fillColor": _normalize_color_ref(node.get("FillColor", "")),
        "strokeColor": _normalize_color_ref(node.get("StrokeColor", "")),
        "frameRect": rect,
    }


def _extract_descriptor(page):
    descriptor = []
    for node in page.iter():
        if local_name(node.tag) != "Descriptor":
            continue
        for child in node:
            if local_name(child.tag) == "ListItem":
                descriptor.append((child.get("type", ""), (child.text or "").strip()))
        break
    if not descriptor:
        return None
    record = {
        "raw": descriptor,
        "sectionPrefix": descriptor[0][1] if len(descriptor) > 0 else "",
        "numberingStyle": descriptor[1][1] if len(descriptor) > 1 else "",
        "sectionPageStart": descriptor[4][1] if len(descriptor) > 4 else "",
        "absolutePageStart": descriptor[5][1] if len(descriptor) > 5 else "",
        "sectionMarker": descriptor[6][1] if len(descriptor) > 6 else "",
    }
    return record


def parse_pages(archive, spread_sources=None):
    sources = spread_sources or [
        name
        for name in archive.namelist()
        if name.startswith("Spreads/Spread_") and name.endswith(".xml")
    ]

    pages = []
    for member_name in sources:
        root = parse_xml(archive, member_name)
        parent_map = {child: parent for parent in root.iter() for child in list(parent)}
        spread = next((node for node in root.iter() if local_name(node.tag) == "Spread" and node.get("Self")), None)
        spread_id = spread.get("Self", "") if spread is not None else ""

        spread_pages = []
        for index, page in enumerate(node for node in root.iter() if local_name(node.tag) == "Page"):
            record = {
                "pageId": page.get("Self", ""),
                "pageName": page.get("Name", ""),
                "pageIndex": index,
                "pageSequence": len(pages) + 1,
                "appliedMaster": page.get("AppliedMaster", ""),
                "spreadId": spread_id,
                "spreadSource": member_name,
                "storyRefs": [],
                "pageItems": [],
                "frameSwatches": [],
                "descriptor": _extract_descriptor(page),
                "_rect": _get_page_rect(page),
            }
            spread_pages.append(record)
            pages.append(record)

        for node in root.iter():
            if local_name(node.tag) != "TextFrame":
                continue
            story_id = str(node.get("ParentStory", "")).strip()
            if not story_id:
                continue
            frame_rect = _get_text_frame_rect(node, parent_map)
            target_page = _resolve_page_for_rect(frame_rect, spread_pages)
            if not target_page:
                continue
            text_status = _classify_text_frame_status(
                frame_rect,
                target_page.get("_rect"),
                str(node.get("Overflows", "")).strip().lower() == "true",
            )
            story_ref = {
                "storyId": story_id,
                "frameId": node.get("Self", ""),
                "appliedObjectStyle": node.get("AppliedObjectStyle", ""),
                "fillColor": _normalize_color_ref(node.get("FillColor", "")),
                "strokeColor": _normalize_color_ref(node.get("StrokeColor", "")),
                "textStatus": text_status,
                "frameRect": frame_rect,
            }
            target_page["storyRefs"].append(story_ref)
            for color_name in [story_ref["fillColor"], story_ref["strokeColor"]]:
                if color_name and color_name not in target_page["frameSwatches"]:
                    target_page["frameSwatches"].append(color_name)

        for node in root.iter():
            tag = local_name(node.tag)
            if tag not in {"Rectangle", "Polygon", "Oval", "GraphicLine", "Group"}:
                continue
            rect = _get_path_rect(node, parent_map)
            if not rect:
                continue
            target_page = _resolve_page_for_rect(rect, spread_pages)
            if not target_page:
                continue
            item_record = _build_page_item_record(node, tag, rect)
            target_page["pageItems"].append(item_record)
            for color_name in [item_record["fillColor"], item_record["strokeColor"]]:
                if color_name and color_name not in target_page["frameSwatches"]:
                    target_page["frameSwatches"].append(color_name)

    for page in pages:
        page["pageRect"] = page.get("_rect") or None
        page.pop("_rect", None)
    return pages
