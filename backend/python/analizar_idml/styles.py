import xml.etree.ElementTree as ET


def parse_xml(archive, member_name):
    return ET.fromstring(archive.read(member_name))


def local_name(tag):
    return tag.split("}", 1)[-1]


def parse_designmap(archive):
    root = parse_xml(archive, "designmap.xml")
    story_sources = []
    spread_sources = []
    master_spread_sources = []
    graphic_source = ""
    styles_source = ""

    for child in root:
        tag = local_name(child.tag)
        source = child.get("src", "")
        if tag == "Story" and source:
            story_sources.append(source)
        elif tag == "Spread" and source:
            spread_sources.append(source)
        elif tag == "MasterSpread" and source:
            master_spread_sources.append(source)
        elif tag == "Graphic" and source:
            graphic_source = source
        elif tag == "Styles" and source:
            styles_source = source

    document = next((node for node in root.iter() if local_name(node.tag) == "Document"), None)
    story_list = []
    if document is not None:
        story_list = [value for value in (document.get("StoryList", "") or "").split() if value]

    return {
        "storySources": story_sources,
        "spreadSources": spread_sources,
        "masterSpreadSources": master_spread_sources,
        "graphicSource": graphic_source,
        "stylesSource": styles_source,
        "storyList": story_list,
    }


def _collect_style_nodes(root, target_tag):
    entries = []
    for node in root.iter():
        if local_name(node.tag) != target_tag:
            continue
        entries.append({
            "self": node.get("Self", ""),
            "name": node.get("Name", ""),
            "basedOn": node.get("BasedOn", ""),
            "fillColor": node.get("FillColor", ""),
            "strokeColor": node.get("StrokeColor", ""),
            "pointSize": node.get("PointSize", ""),
            "fontStyle": node.get("FontStyle", ""),
        })
    return entries


def parse_styles(archive, member_name="Resources/Styles.xml"):
    root = parse_xml(archive, member_name)
    return {
        "paragraphStyles": _collect_style_nodes(root, "ParagraphStyle"),
        "characterStyles": _collect_style_nodes(root, "CharacterStyle"),
        "objectStyles": _collect_style_nodes(root, "ObjectStyle"),
    }
