from .pages import _get_page_rect, _get_text_frame_rect, _normalize_color_ref, _resolve_page_for_rect
from .styles import local_name, parse_xml


def parse_master_spreads(archive, master_spread_sources=None):
    sources = master_spread_sources or [
        name
        for name in archive.namelist()
        if name.startswith("MasterSpreads/MasterSpread_") and name.endswith(".xml")
    ]

    masters = {}
    for member_name in sources:
        root = parse_xml(archive, member_name)
        parent_map = {child: parent for parent in root.iter() for child in list(parent)}
        master = next((node for node in root.iter() if local_name(node.tag) == "MasterSpread" and node.get("Self")), None)
        if master is None:
            continue

        master_id = master.get("Self", "")
        page_entries = []
        for index, page in enumerate(node for node in root.iter() if local_name(node.tag) == "Page"):
            page_entries.append({
                "pageId": page.get("Self", ""),
                "pageName": page.get("Name", ""),
                "pageIndex": index,
                "appliedMaster": page.get("AppliedMaster", ""),
                "storyRefs": [],
                "frameSwatches": [],
                "_rect": _get_page_rect(page),
            })

        for node in root.iter():
            if local_name(node.tag) != "TextFrame":
                continue
            story_id = str(node.get("ParentStory", "")).strip()
            if not story_id:
                continue
            target_page = _resolve_page_for_rect(_get_text_frame_rect(node, parent_map), page_entries)
            if not target_page:
                continue
            story_ref = {
                "storyId": story_id,
                "frameId": node.get("Self", ""),
                "appliedObjectStyle": node.get("AppliedObjectStyle", ""),
                "fillColor": _normalize_color_ref(node.get("FillColor", "")),
                "strokeColor": _normalize_color_ref(node.get("StrokeColor", "")),
                "fromMaster": True,
            }
            target_page["storyRefs"].append(story_ref)
            for color_name in [story_ref["fillColor"], story_ref["strokeColor"]]:
                if color_name and color_name not in target_page["frameSwatches"]:
                    target_page["frameSwatches"].append(color_name)

        for page in page_entries:
            page.pop("_rect", None)

        masters[master_id] = {
            "masterId": master_id,
            "source": member_name,
            "namePrefix": master.get("NamePrefix", ""),
            "baseName": master.get("BaseName", ""),
            "showMasterItems": str(master.get("ShowMasterItems", "true")).lower() != "false",
            "pages": page_entries,
        }

    return masters
