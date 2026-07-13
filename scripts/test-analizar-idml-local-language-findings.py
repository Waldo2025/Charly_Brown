#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.orthotypography import find_orthotypography_issues, _is_valid_issue
from backend.python.analizar_idml.spelling import find_spelling_issues, _is_valid_spelling_match


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    blocks = [
        {
            "pageName": "203",
            "storyId": "story_language_local",
            "storyTitle": "Texto local",
            "blockType": "otros",
            "styleName": "texto_recortable",
            "text": (
                "Este parrafo contiene una palabra sin acento: ortografia. "
                "Tambien tiene espacio antes de coma , pregunta sin apertura Qué haces? "
                "y puntuacion repetida!!"
            ),
        },
        {
            "pageName": "43",
            "storyId": "story_valid_question",
            "storyTitle": "Pregunta valida",
            "blockType": "otros",
            "styleName": "cuerpo",
            "text": (
                "¿Cómo le explicarías a Mariana por qué cambia el valor de una cifra cuando cambia de lugar?\n"
                "¿Qué pasa cuando no hay ningún material en alguna de las columnas?"
            ),
        },
        {
            "pageName": "51",
            "storyId": "story_rae_2010_guion",
            "storyTitle": "Guion normativo",
            "blockType": "otros",
            "styleName": "titulo_literaturas",
            "text": "Del guion a las viñetas",
        },
        {
            "pageName": "225",
            "storyId": "story_inline_number_artifact",
            "storyTitle": "Artefacto de número inline",
            "blockType": "otros",
            "styleName": "texto_recortable",
            "text": "Mi número es , ¿quién tiene 5 más?",
        },
        {
            "pageName": "10",
            "storyId": "story_long_valid_question",
            "storyTitle": "Pregunta detonadora larga",
            "blockType": "otros",
            "styleName": "texto",
            "text": (
                ("Texto editorial de contexto con extensión suficiente para activar ventanas. " * 24)
                + "¿Cómo podemos utilizar el arte, los sonidos y nuestra voz para contar la historia de "
                + "nuestro territorio, mostrar los cambios de la naturaleza a través del tiempo y promover "
                + "la convivencia pacífica en nuestra comunidad?"
            ),
        }
    ]

    spelling = find_spelling_issues(blocks, gemini_verifier=None)
    orthotypography = find_orthotypography_issues(blocks, gemini_verifier=None)

    assert_true(
        any(issue.get("token") == "ortografia" and "ortografía" in (issue.get("replacements") or []) for issue in spelling),
        "El analizador IDML debe detectar ortografía local sin depender de Gemini.",
    )
    assert_true(
        not any(str(issue.get("token") or "").lower() == "guion" for issue in spelling),
        "El analizador IDML no debe marcar 'guion' como error: desde la Ortografía RAE-ASALE 2010 va sin tilde.",
    )
    assert_true(
        not _is_valid_spelling_match("Del guion a las viñetas", "guion", "guión"),
        "El filtro de Gemini debe rechazar la sugerencia normativa incorrecta guion -> guión.",
    )
    assert_true(
        any("Espacio indebido" in (issue.get("message") or "") for issue in orthotypography),
        "El analizador IDML debe detectar espacio indebido antes de puntuación.",
    )
    assert_true(
        any(
            issue.get("excerpt") == "coma ," and issue.get("suggestion") == "coma,"
            for issue in orthotypography
        ),
        "El hallazgo de espacio antes de puntuación debe mostrar la palabra afectada, no solo ',' -> ','.",
    )
    assert_true(
        not any('Fragmento: ",". Sugerencia: ",".' in (issue.get("message") or "") for issue in orthotypography),
        "El reporte no debe perder el espacio del fragmento y mostrar una sugerencia idéntica.",
    )
    assert_true(
        not any(
            issue.get("pageName") == "225" and issue.get("excerpt") == "es ,"
            for issue in orthotypography
        ),
        "No debe marcar 'es ,' cuando el número inline se perdió durante la extracción IDML y la coma precede una pregunta.",
    )
    assert_true(
        any("Pregunta sin signo" in (issue.get("message") or "") for issue in orthotypography),
        "El analizador IDML debe detectar pregunta sin signo de apertura.",
    )
    assert_true(
        not any(
            issue.get("pageName") == "43" and "Pregunta sin signo" in (issue.get("message") or "")
            for issue in orthotypography
        ),
        "El analizador IDML no debe cortar una pregunta valida y marcar el 'por qué' interno como falta de apertura.",
    )
    assert_true(
        not any(
            issue.get("pageName") == "10" and "Pregunta sin signo" in (issue.get("message") or "")
            for issue in orthotypography
        ),
        "El analizador IDML no debe cortar una pregunta larga valida y marcar su cola como falta de apertura.",
    )
    assert_true(
        not _is_valid_issue(
            blocks[-1]["text"],
            "promover la convivencia pacífica en nuestra comunidad?",
            "¿promover la convivencia pacífica en nuestra comunidad?",
        ),
        "El filtro de Gemini debe rechazar una sugerencia falsa si el fragmento ya pertenece a una pregunta abierta con '¿'.",
    )
    assert_true(
        all(issue.get("pageName") == "203" for issue in spelling + orthotypography),
        "Los hallazgos locales deben conservar pageName para renderizarse por página.",
    )

    sys.stdout.write("Analizar IDML local language findings OK.\n")


if __name__ == "__main__":
    main()
