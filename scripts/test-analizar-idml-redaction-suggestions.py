#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.redaction import find_redaction_issues


class DisabledVerifier:
    enabled = False


class FakeVerifier:
    enabled = True

    def verify_text_block(self, block, category):
        if category != "redaction":
            return []
        text = str((block or {}).get("text") or "")
        if "idea queda incompleta" in text:
            return [{
                "excerpt": "La idea queda incompleta porque no se entiende qué deben comparar después de observar.",
                "suggestion": "Después de observar, comparen los cambios que identificaron y expliquen qué elemento provocó cada diferencia.",
                "reason": "La instrucción no aclara la acción posterior a la observación.",
                "confidence": 0.91,
            }]
        if "Recortable PaT1" in text:
            return [{
                "excerpt": "Recortable PaT1",
                "suggestion": "Recortable PaT1",
                "reason": "Código editorial.",
                "confidence": 0.99,
            }]
        return []


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    blocks = [
        {
            "pageName": "11",
            "storyId": "story_code",
            "styleName": "08_01_COMPETENCIA",
            "text": "Observa atentamente el anexo PaT1 Elementos de un ecosistema y utiliza el Recortable PaT1.",
        },
        {
            "pageName": "12",
            "storyId": "story_unclear",
            "styleName": "Texto",
            "text": "La idea queda incompleta porque no se entiende qué deben comparar después de observar. Comenten con su equipo.",
        },
    ]

    assert_true(find_redaction_issues(blocks, gemini_verifier=DisabledVerifier()) == [], "Gemini deshabilitado no debe crear propuestas.")
    issues = find_redaction_issues(blocks, gemini_verifier=FakeVerifier(), max_windows=4)
    assert_true(len(issues) == 1, f"Debe aceptar solo la incoherencia real, no códigos editoriales: {issues}")
    issue = issues[0]
    assert_true(issue["pageName"] == "12", "La propuesta debe conservar página.")
    assert_true(issue["styleName"] == "Texto", "La propuesta debe conservar estilo.")
    assert_true(issue["suggestion"], "La propuesta debe incluir sugerencia.")
    assert_true(issue["confidence"] >= 0.72, "La propuesta debe conservar confianza suficiente.")

    sys.stdout.write("Analizar IDML redaction suggestions OK.\n")


if __name__ == "__main__":
    main()
