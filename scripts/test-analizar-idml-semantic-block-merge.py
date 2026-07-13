#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.orthotypography import find_orthotypography_issues
from backend.python.analizar_idml.pipeline import _build_semantic_blocks


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    page_reports = [
        {
            "pageName": "225",
            "content": {
                "otro": [
                    {
                        "storyId": "story_split_question",
                        "storyTitle": "Solucionario reducido",
                        "styleName": "solucionario_reducido",
                        "text": "animales\nespecies en peligro de extinción\n¿qué especies",
                    },
                    {
                        "storyId": "story_split_question",
                        "storyTitle": "Solucionario reducido",
                        "styleName": "solucionario_reducido_bold",
                        "text": "están en peligro de extinción en México?",
                    },
                    {
                        "storyId": "story_split_question",
                        "storyTitle": "Solucionario reducido",
                        "styleName": "solucionario_reducido",
                        "text": "páginas de Internet",
                    },
                ]
            },
        }
    ]

    blocks = _build_semantic_blocks(page_reports)
    assert_true(len(blocks) == 1, "Los fragmentos de una misma story/página deben consolidarse para revisión lingüística.")
    assert_true(
        "¿qué especies\nestán en peligro" in blocks[0]["text"],
        "El bloque consolidado debe conservar el contexto anterior al salto visual.",
    )
    orthotypography = find_orthotypography_issues(blocks, gemini_verifier=None)
    assert_true(
        not any("Pregunta sin signo" in (issue.get("message") or "") for issue in orthotypography),
        "No debe marcar pregunta sin apertura cuando el signo está en un fragmento anterior de la misma story.",
    )

    sys.stdout.write("Analizar IDML semantic block merge OK.\n")


if __name__ == "__main__":
    main()
