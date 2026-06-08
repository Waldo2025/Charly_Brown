#!/usr/bin/env python3
import argparse
import json
import sys
import zipfile
from copy import deepcopy
from datetime import datetime
from pathlib import Path
import xml.etree.ElementTree as ET


MARK_STYLE_NAME = "Peppermint Patty Editor"
MARK_STYLE_SELF = f"CharacterStyle/{MARK_STYLE_NAME}"
SAFE_FLATTEN_CHANGE_TYPES = {"InsertedText", "MovedText"}


def parse_xml_bytes(xml_bytes):
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_pis=True))
    return ET.fromstring(xml_bytes, parser=parser)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--payload-json")
    parser.add_argument("--payload-file")
    return parser.parse_args()


def local_name(tag):
    if not isinstance(tag, str):
        return ""
    return tag.split("}", 1)[-1]


def now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat()


def normalize_cleanup_options(payload):
    raw = (payload or {}).get("cleanupOptions") or {}
    if not isinstance(raw, dict):
        raw = {}
    return {
        "removeOldNotes": raw.get("removeOldNotes") is True,
        "removeUnusedParagraphStyles": raw.get("removeUnusedParagraphStyles") is True,
        "removeUnusedCharacterStyles": raw.get("removeUnusedCharacterStyles") is True,
        "removeUnusedSwatches": raw.get("removeUnusedSwatches") is True,
        "removeOffPageObjects": raw.get("removeOffPageObjects") is True,
        "removeOffPageText": raw.get("removeOffPageText") is True,
        "applySelectedCorrections": raw.get("applySelectedCorrections") is True,
    }


def _rects_intersect(a, b):
    if not a or not b:
        return False
    return not (
        float(a.get("x2", 0)) <= float(b.get("x1", 0))
        or float(a.get("x1", 0)) >= float(b.get("x2", 0))
        or float(a.get("y2", 0)) <= float(b.get("y1", 0))
        or float(a.get("y1", 0)) >= float(b.get("y2", 0))
    )


def collect_cleanup_targets(payload, cleanup_options):
    result = (payload or {}).get("result") or {}
    stats = result.get("stats") or {}
    page_reports = stats.get("pageReports") or []
    text_frame_ids = set()
    off_page_object_ids = set()
    for page in page_reports:
        page_rect = (page or {}).get("pageRect") or {}
        if cleanup_options.get("removeOffPageText"):
            for story_ref in (page or {}).get("storyRefs") or []:
                if str((story_ref or {}).get("textStatus") or "").strip() != "fuera de la página":
                    continue
                frame_id = str((story_ref or {}).get("frameId") or "").strip()
                if frame_id:
                    text_frame_ids.add(frame_id)
        if cleanup_options.get("removeOffPageObjects"):
            for item in (page or {}).get("pageItems") or []:
                item_id = str((item or {}).get("itemId") or "").strip()
                frame_rect = (item or {}).get("frameRect") or {}
                if item_id and frame_rect and page_rect and not _rects_intersect(frame_rect, page_rect):
                    off_page_object_ids.add(item_id)
    return {
        "textFrameIds": text_frame_ids,
        "offPageObjectIds": off_page_object_ids,
    }


def ensure_mark_style(styles_xml_bytes):
    root = parse_xml_bytes(styles_xml_bytes)
    exists = False
    for node in root.iter():
      if local_name(node.tag) == "CharacterStyle" and str(node.get("Name") or "").strip() == MARK_STYLE_NAME:
        exists = True
        break
    if not exists:
      style = ET.Element("CharacterStyle")
      style.set("Self", MARK_STYLE_SELF)
      style.set("Name", MARK_STYLE_NAME)
      style.set("FillColor", "Color/Black")
      style.set("FontStyle", "Italic")
      root.append(style)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def build_operations(payload):
    correction_selection = (payload or {}).get("correctionSelection") or {}
    selected_issues = correction_selection.get("selectedIssues") or []
    if isinstance(selected_issues, list) and selected_issues:
        operations = []
        for item in selected_issues:
            source = str((item or {}).get("source") or "").strip()
            target = str((item or {}).get("target") or "").strip()
            if not source or not target or source == target:
                continue
            operations.append({
                "id": str((item or {}).get("id") or "").strip(),
                "kind": str((item or {}).get("kind") or "").strip() or "manual",
                "source": source,
                "target": target,
                "pageName": str((item or {}).get("pageName") or "").strip(),
                "storyId": str((item or {}).get("storyId") or "").strip(),
                "storyTitle": str((item or {}).get("storyTitle") or "").strip(),
                "storySource": str((item or {}).get("storySource") or "").strip(),
                "context": str((item or {}).get("context") or "").strip(),
                "message": str((item or {}).get("message") or "").strip(),
            })
        return operations
    result = (payload or {}).get("result") or {}
    operations = []
    for issue in result.get("orthotypographyIssues") or []:
        excerpt = str(issue.get("excerpt") or "").strip()
        suggestion = str(issue.get("suggestion") or "").strip()
        if excerpt and suggestion and excerpt != suggestion:
            operations.append({
                "id": str(issue.get("id") or "").strip(),
                "kind": "orthotypography",
                "source": excerpt,
                "target": suggestion,
                "pageName": str(issue.get("pageName") or "").strip(),
                "storyId": str(issue.get("storyId") or "").strip(),
                "storyTitle": str(issue.get("storyTitle") or "").strip(),
                "storySource": str(issue.get("storySource") or "").strip(),
                "context": str(issue.get("context") or "").strip(),
                "message": str(issue.get("message") or "").strip(),
            })
    for issue in result.get("spellingIssues") or []:
        source = str(issue.get("token") or "").strip()
        replacements = issue.get("replacements") or []
        target = str(replacements[0] or "").strip() if replacements else ""
        if source and target and source != target:
            operations.append({
                "id": str(issue.get("id") or "").strip(),
                "kind": "spelling",
                "source": source,
                "target": target,
                "pageName": str(issue.get("pageName") or "").strip(),
                "storyId": str(issue.get("storyId") or "").strip(),
                "storyTitle": str(issue.get("storyTitle") or "").strip(),
                "storySource": str(issue.get("storySource") or "").strip(),
                "context": str(issue.get("context") or "").strip(),
                "message": str(issue.get("message") or "").strip(),
            })
    return operations


def build_editorial_note_text(operation):
    source = str(operation.get("source") or "").strip()
    target = str(operation.get("target") or "").strip()
    kind = str(operation.get("kind") or "correccion").strip().lower()
    page_name = str(operation.get("pageName") or "").strip()
    detail = "ortografía" if kind == "spelling" else "ortotipografía" if kind == "orthotypography" else "corrección"
    note = f"[Peppermint Patty] Revisar {detail}"
    if page_name:
        note += f" en página {page_name}"
    if source and target:
        note += f': "{source}" -> "{target}"'
    message = str(operation.get("message") or "").strip()
    if message:
        note += f". {message}"
    return note


def create_note_node(operation):
    note = ET.Element("Note")
    timestamp = now_iso()
    note.set("Collapsed", "false")
    note.set("CreationDate", timestamp)
    note.set("ModificationDate", timestamp)
    note.set("UserName", "Peppermint Patty")

    paragraph = ET.SubElement(note, "ParagraphStyleRange")
    paragraph.set("AppliedParagraphStyle", "ParagraphStyle/$ID/[No paragraph style]")

    character = ET.SubElement(paragraph, "CharacterStyleRange")
    character.set("AppliedCharacterStyle", "CharacterStyle/$ID/[No character style]")

    content = ET.SubElement(character, "Content")
    content.text = build_editorial_note_text(operation)
    return note


def append_editorial_note(root, operation):
    story = next((node for node in root.iter() if local_name(node.tag) == "Story" and node.get("Self")), None)
    if story is None:
        return False
    story.append(create_note_node(operation))
    return True


def splice_children(parent, node, children):
    try:
        insert_at = list(parent).index(node)
    except ValueError:
        insert_at = len(list(parent))
    for offset, child in enumerate(children):
        parent.insert(insert_at + offset, child)


def remove_spread_items(spread_xml_bytes, cleanup_targets, cleanup_options):
    if not cleanup_options.get("removeOffPageText") and not cleanup_options.get("removeOffPageObjects"):
        return spread_xml_bytes, []
    root = parse_xml_bytes(spread_xml_bytes)
    text_frame_ids = cleanup_targets.get("textFrameIds") or set()
    off_page_object_ids = cleanup_targets.get("offPageObjectIds") or set()
    removals = []
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    for node in list(root.iter()):
        parent = parent_map.get(node)
        if parent is None:
            continue
        tag_name = local_name(node.tag)
        node_id = str(node.get("Self") or "").strip()
        if cleanup_options.get("removeOffPageText") and tag_name == "TextFrame" and node_id in text_frame_ids:
            parent.remove(node)
            removals.append({
                "kind": "cleanup_off_page_text",
                "status": "removed_text_frame",
                "itemId": node_id,
            })
            continue
        if cleanup_options.get("removeOffPageObjects") and tag_name in {"Rectangle", "Polygon", "Oval", "GraphicLine", "Group"} and node_id in off_page_object_ids:
            parent.remove(node)
            removals.append({
                "kind": "cleanup_off_page_object",
                "status": "removed_page_item",
                "itemId": node_id,
                "itemKind": tag_name,
            })
    return ET.tostring(root, encoding="utf-8", xml_declaration=True), removals


def cleanup_story_change_history(root, cleanup_options):
    if not cleanup_options.get("removeOldNotes"):
        return []
    removals = []
    while True:
        parent_map = {child: parent for parent in root.iter() for child in list(parent)}
        change_nodes = [node for node in root.iter() if local_name(node.tag) == "Change"]
        if not change_nodes:
            break
        node = change_nodes[0]
        parent = parent_map.get(node)
        if parent is None:
            break
        change_type = str(node.get("ChangeType") or "").strip()
        if change_type == "DeletedText":
            parent.remove(node)
            removals.append({
                "kind": "cleanup_old_notes",
                "status": "removed_deleted_text",
                "changeType": change_type,
            })
            continue
        if change_type in SAFE_FLATTEN_CHANGE_TYPES:
            preserved_children = [deepcopy(child) for child in list(node)]
            splice_children(parent, node, preserved_children)
            parent.remove(node)
            removals.append({
                "kind": "cleanup_old_notes",
                "status": "flattened_change",
                "changeType": change_type,
            })
            continue
        removals.append({
            "kind": "cleanup_old_notes",
            "status": "unsupported_change_type",
            "changeType": change_type or "unknown",
        })
        break
    return removals


def find_content_candidates(root, source):
    candidates = []
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    for node in root.iter():
        if local_name(node.tag) != "CharacterStyleRange":
            continue
        current = parent_map.get(node)
        inside_note = False
        while current is not None:
            if local_name(current.tag) == "Note":
                inside_note = True
                break
            current = parent_map.get(current)
        if inside_note:
            continue
        for child in list(node):
            if local_name(child.tag) != "Content" or not child.text or source not in child.text:
                continue
            candidates.append((node, child))
    return candidates


def choose_candidate(candidates, operation):
    if not candidates:
        return None, "missing"
    if len(candidates) == 1:
        return candidates[0], "exact"
    context = str(operation.get("context") or "").strip()
    if context:
        narrowed = [
            candidate
            for candidate in candidates
            if str(candidate[1].text or "").strip() and (
                str(candidate[1].text or "").strip() in context
                or context in str(candidate[1].text or "")
            )
        ]
        if len(narrowed) == 1:
            return narrowed[0], "context"
    return None, "ambiguous"


def apply_operations_to_story_xml(story_xml_bytes, operations, cleanup_options=None):
    root = parse_xml_bytes(story_xml_bytes)
    story = next((node for node in root.iter() if local_name(node.tag) == "Story" and node.get("Self")), None)
    story_id = str(story.get("Self") or "").strip() if story is not None else ""
    cleanup_changes = cleanup_story_change_history(root, cleanup_options or {})
    applied = []
    editorial_notes = []
    remaining = []
    ops = deepcopy(operations)
    for operation in ops:
        target_story_id = str(operation.get("storyId") or "").strip()
        if target_story_id and story_id and target_story_id != story_id:
            remaining.append(operation)
            continue
        found = False
        source = str(operation.get("source") or "")
        target = str(operation.get("target") or "")
        if not source or not target:
            remaining.append(operation)
            continue
        candidates = find_content_candidates(root, source)
        candidate, resolution = choose_candidate(candidates, operation)
        if candidate is not None:
            node, child = candidate
            child.text = child.text.replace(source, target, 1)
            found = True
            applied.append({
                **operation,
                "status": "applied",
                "resolution": resolution,
                "toolName": MARK_STYLE_NAME,
            })
        if found:
            continue
        if append_editorial_note(root, operation):
            editorial_notes.append({
                **operation,
                "status": "editorial_note",
                "resolution": resolution,
                "toolName": MARK_STYLE_NAME,
            })
        else:
            remaining.append(operation)
    if not cleanup_changes and not applied and not editorial_notes:
        return story_xml_bytes, cleanup_changes, applied, editorial_notes, remaining
    return ET.tostring(root, encoding="utf-8", xml_declaration=True), cleanup_changes, applied, editorial_notes, remaining


def main():
    args = parse_args()
    if args.payload_file:
        payload = json.loads(Path(args.payload_file).read_text(encoding="utf-8"))
    elif args.payload_json:
        payload = json.loads(args.payload_json)
    else:
        raise SystemExit("Missing --payload-json or --payload-file")
    cleanup_options = normalize_cleanup_options(payload)
    cleanup_targets = collect_cleanup_targets(payload, cleanup_options)
    operations = build_operations(payload)
    cleanup_changes = []
    applied = []
    editorial_notes = []
    omitted = []
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.input, "r") as source_zip, zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as output_zip:
        remaining_operations = operations
        for member in source_zip.infolist():
            content = source_zip.read(member.filename)
            if member.filename == "Resources/Styles.xml":
                content = ensure_mark_style(content)
            elif member.filename.startswith("Spreads/Spread_") and member.filename.endswith(".xml"):
                content, spread_cleanup_changes = remove_spread_items(content, cleanup_targets, cleanup_options)
                cleanup_changes.extend(spread_cleanup_changes)
            elif member.filename.startswith("Stories/Story_") and member.filename.endswith(".xml") and (remaining_operations or cleanup_options.get("removeOldNotes")):
                content, story_cleanup_changes, story_applied, story_editorial_notes, remaining_operations = apply_operations_to_story_xml(
                    content,
                    remaining_operations,
                    cleanup_options,
                )
                cleanup_changes.extend(story_cleanup_changes)
                applied.extend(story_applied)
                editorial_notes.extend(story_editorial_notes)
            output_zip.writestr(member, content)
        omitted.extend({
            **operation,
            "status": "omitted",
            "toolName": MARK_STYLE_NAME,
        } for operation in remaining_operations)

    sys.stdout.write(json.dumps({
        "ok": True,
        "toolName": MARK_STYLE_NAME,
        "cleanupChangeCount": len(cleanup_changes),
        "appliedCount": len(applied),
        "editorialNoteCount": len(editorial_notes),
        "omittedCount": len(omitted),
        "changes": cleanup_changes + applied + editorial_notes + omitted,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
