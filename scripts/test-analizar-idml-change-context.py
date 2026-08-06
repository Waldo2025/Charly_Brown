#!/usr/bin/env python3
import pathlib
import sys
import xml.etree.ElementTree as ET


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "python"))

from analizar_idml.orthotypography import find_orthotypography_issues  # noqa: E402
from analizar_idml.pipeline import _attach_page_notes  # noqa: E402
from analizar_idml.stories import _extract_story_changes, _extract_story_notes  # noqa: E402


def test_tracked_changes_are_not_treated_as_notes():
    root = ET.fromstring("""
      <Story Self="story-1">
        <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
          <CharacterStyleRange><Content>Antes </Content></CharacterStyleRange>
          <Change ChangeType="InsertedText" UserName="Lili" Date="2026-03-20T14:27:35">
            <CharacterStyleRange><Content>nuevo</Content></CharacterStyleRange>
          </Change>
          <Change ChangeType="DeletedText" UserName="Ana" Date="2026-03-21T10:00:00">
            <CharacterStyleRange><Content>eliminado</Content></CharacterStyleRange>
          </Change>
        </ParagraphStyleRange>
      </Story>
    """)
    paragraph = next(node for node in root.iter() if node.tag == "ParagraphStyleRange")
    changes = _extract_story_changes(root, {paragraph: 4})
    assert [item["changeType"] for item in changes] == ["InsertedText", "DeletedText"]
    assert [item["text"] for item in changes] == ["nuevo", "eliminado"]
    assert all(item["paragraphText"] == "Antes nuevoeliminado" for item in changes)
    assert all(item["blockOrder"] == 4 for item in changes)


def test_paired_mark_can_open_on_previous_page():
    blocks = [
        {
            "pageName": "10",
            "pageSequence": 10,
            "documentOrder": 0,
            "storyId": "story-threaded",
            "text": "¿Esta pregunta comienza dentro de una caja de la página anterior y continúa",
        },
        {
            "pageName": "11",
            "pageSequence": 11,
            "documentOrder": 1,
            "storyId": "story-threaded",
            "text": "hasta cerrar correctamente en la caja de la página siguiente?",
        },
    ]
    assert find_orthotypography_issues(blocks) == []

    unmatched = find_orthotypography_issues([{
        "pageName": "11",
        "pageSequence": 11,
        "documentOrder": 1,
        "storyId": "story-threaded",
        "text": "Esta pregunta no tiene ningún signo de apertura?",
    }])
    assert len(unmatched) == 1
    assert "sin signo de apertura" in unmatched[0]["message"]


def test_idml_notes_keep_their_story_block_and_page():
    root = ET.fromstring("""
      <Story Self="story-notes">
        <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
          <CharacterStyleRange><Content>Texto de página uno. </Content></CharacterStyleRange>
          <Note UserName="Ana" CreationDate="2026-08-01T09:00:00" ModificationDate="2026-08-01T09:05:00">
            <ParagraphStyleRange><CharacterStyleRange><Content>Revisar esta idea.</Content></CharacterStyleRange></ParagraphStyleRange>
          </Note>
        </ParagraphStyleRange>
        <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
          <CharacterStyleRange><Content>Texto de página dos. </Content></CharacterStyleRange>
          <Note UserName="Luis" CreationDate="2026-08-01T10:00:00">
            <ParagraphStyleRange><CharacterStyleRange><Content>Confirmar esta fuente.</Content></CharacterStyleRange></ParagraphStyleRange>
          </Note>
        </ParagraphStyleRange>
      </Story>
    """)
    paragraphs = [
        node for node in root.iter()
        if node.tag == "ParagraphStyleRange" and node.get("AppliedParagraphStyle") == "ParagraphStyle/Body"
    ]
    note_buckets = _extract_story_notes(root, {paragraphs[0]: 0, paragraphs[1]: 1})
    assert [item["blockOrder"] for item in note_buckets["active"]] == [0, 1]
    assert [item["userName"] for item in note_buckets["active"]] == ["Ana", "Luis"]
    assert [item["paragraphText"] for item in note_buckets["active"]] == [
        "Texto de página uno.",
        "Texto de página dos.",
    ]

    pages = [
        {
            "pageName": "1",
            "content": {"párrafos normales": [{"storyId": "story-notes", "blockOrder": 0, "text": "Texto de página uno."}]},
        },
        {
            "pageName": "2",
            "content": {"párrafos normales": [{"storyId": "story-notes", "blockOrder": 1, "text": "Texto de página dos."}]},
        },
    ]
    active, history, attached_pages = _attach_page_notes(pages, [{
        "storyId": "story-notes",
        "storyTitle": "Historia con notas",
        "notes": note_buckets,
    }])
    assert history == []
    assert [item["pageName"] for item in active] == ["1", "2"]
    assert [item["text"] for item in attached_pages[0]["notes"]] == ["Revisar esta idea."]
    assert [item["text"] for item in attached_pages[1]["notes"]] == ["Confirmar esta fuente."]


if __name__ == "__main__":
    test_tracked_changes_are_not_treated_as_notes()
    test_paired_mark_can_open_on_previous_page()
    test_idml_notes_keep_their_story_block_and_page()
    print("IDML notes, tracked changes and cross-page punctuation: OK")
