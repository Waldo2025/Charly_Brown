from .styles import local_name, parse_xml

AUTO_PAGE_NUMBER_TOKEN = "__AUTO_PAGE_NUMBER__"


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
        clean = " ".join(fragment.split())
        if not clean:
            continue
        if not pieces:
            pieces.append(clean)
            continue
        previous = pieces[-1]
        if previous.endswith("\n"):
            pieces.append(clean)
            continue
        if clean[0] in ".,;:!?)]}»”\"":
            pieces[-1] = previous.rstrip() + clean
            continue
        if previous and previous[-1] in "¿¡([{\"«“":
            pieces[-1] = previous + clean
            continue
        pieces.append(f" {clean}")

    joined = "".join(pieces)
    return (
        joined
        .replace(" \n", "\n")
        .replace("\n ", "\n")
        .strip()
    )


def _extract_text_from_node(node):
    fragments = []
    for descendant in node.iter():
        tag = local_name(descendant.tag)
        if tag == "Content" and descendant.text:
            fragments.append(descendant.text)
        elif tag == "Br":
            fragments.append("\n")
    return _normalize_text_fragments(fragments)


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

        for node in root.iter():
            tag = local_name(node.tag)
            if tag == "Content" and node.text:
                content_fragments.append(node.text)
            elif tag == "ParagraphStyleRange":
                paragraph_style_id = node.get("AppliedParagraphStyle", "")
                paragraph_style_ids.append(paragraph_style_id)
                block_character_styles = []
                for descendant in node.iter():
                    if local_name(descendant.tag) == "CharacterStyleRange":
                        style_id = descendant.get("AppliedCharacterStyle", "")
                        if style_id:
                            block_character_styles.append(style_id)
                paragraph_text = _extract_text_from_node(node)
                if not paragraph_text and any(
                    value in {"CharacterStyle/Z_FOLIOS", "CharacterStyle/Z_FOLIOS RECORTABLES"}
                    for value in block_character_styles
                ) and "<?ACE " in raw_xml:
                    paragraph_text = AUTO_PAGE_NUMBER_TOKEN
                if paragraph_text:
                    paragraph_blocks.append({
                        "paragraphStyleId": paragraph_style_id,
                        "characterStyleIds": [value for value in block_character_styles if value],
                        "text": paragraph_text,
                    })
            elif tag == "CharacterStyleRange":
                character_style_ids.append(node.get("AppliedCharacterStyle", ""))

        stories.append(
            {
                "storyId": story.get("Self", ""),
                "storyTitle": story.get("StoryTitle", ""),
                "storySource": member_name,
                "paragraphStyleIds": [value for value in paragraph_style_ids if value],
                "characterStyleIds": [value for value in character_style_ids if value],
                "paragraphBlocks": paragraph_blocks,
                "text": _normalize_text_fragments(content_fragments),
            }
        )

    return stories
