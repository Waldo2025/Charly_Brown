#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.gemini_verifier import GeminiVerifier


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    verifier = GeminiVerifier()
    prompt = verifier._build_prompt(
        {
            "pageName": "43",
            "storyId": "story_prompt_contract",
            "storyTitle": "Contrato de prompt",
            "blockType": "otros",
            "styleName": "cuerpo",
            "text": "¿Cómo le explicarías a Mariana por qué cambia el valor de una cifra cuando cambia de lugar?",
        },
        "orthotypography",
    )

    required_snippets = [
        "español editorial de México",
        "No apliques reglas gramaticales, ortograficas ni de puntuacion del ingles",
        "guion, truhan, fie, liais",
        "no sugieras guión",
        "evalua la pregunta o exclamacion completa",
        "si el segmento ya contiene signo de apertura español",
        "palabras interrogativas internas",
    ]
    missing = [snippet for snippet in required_snippets if snippet not in prompt]
    assert_true(
        not missing,
        f"El prompt Gemini debe blindar la revision para español editorial mexicano. Faltan: {missing}",
    )

    redaction_prompt = verifier._build_prompt(
        {
            "pageName": "11",
            "storyId": "story_redaction_contract",
            "storyTitle": "Contrato de redacción",
            "blockType": "párrafos normales",
            "styleName": "texto",
            "text": "Observa el Anexo PaT1 y usa el Recortable PbT1 para responder.",
        },
        "redaction",
    )
    redaction_snippets = [
        "incoherencias reales que dificulten entenderla",
        "Ignora referencias editoriales y complementos con codigos",
        "Recortable PaT1",
        "Anexo PbT1",
        "no son incoherencias",
    ]
    missing_redaction = [snippet for snippet in redaction_snippets if snippet not in redaction_prompt]
    assert_true(
        not missing_redaction,
        f"El prompt de redacción debe ignorar complementos con código. Faltan: {missing_redaction}",
    )

    sys.stdout.write("Analizar IDML Gemini Spanish prompt contract OK.\n")


if __name__ == "__main__":
    main()
