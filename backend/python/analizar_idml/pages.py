from .styles import local_name, parse_xml


def _parse_transform(value):
    parts = [segment for segment in str(value or "").split() if segment]
    if len(parts) != 6:
        return None
    try:
        return [float(segment) for segment in parts]
    except (TypeError, ValueError):
        return None


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


def _get_path_rect(node):
    transform = _parse_transform(node.get("ItemTransform", ""))
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
        spread = next((node for node in root.iter() if local_name(node.tag) == "Spread" and node.get("Self")), None)
        spread_id = spread.get("Self", "") if spread is not None else ""

        spread_pages = []
        for index, page in enumerate(node for node in root.iter() if local_name(node.tag) == "Page"):
            record = {
                "pageId": page.get("Self", ""),
                "pageName": page.get("Name", ""),
                "pageIndex": index,
                "appliedMaster": page.get("AppliedMaster", ""),
                "spreadId": spread_id,
                "spreadSource": member_name,
                "storyRefs": [],
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
            target_page = _resolve_page_for_rect(_get_path_rect(node), spread_pages)
            if not target_page:
                continue
            story_ref = {
                "storyId": story_id,
                "frameId": node.get("Self", ""),
                "appliedObjectStyle": node.get("AppliedObjectStyle", ""),
                "fillColor": _normalize_color_ref(node.get("FillColor", "")),
                "strokeColor": _normalize_color_ref(node.get("StrokeColor", "")),
            }
            target_page["storyRefs"].append(story_ref)
            for color_name in [story_ref["fillColor"], story_ref["strokeColor"]]:
                if color_name and color_name not in target_page["frameSwatches"]:
                    target_page["frameSwatches"].append(color_name)

    for page in pages:
        page.pop("_rect", None)
    return pages
