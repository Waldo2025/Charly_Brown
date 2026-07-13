#!/usr/bin/env python3
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.rae_validator import (
    lookup_rae_word,
    validate_spelling_candidate_with_rae,
)


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    os.environ.pop("ANALIZAR_IDML_REQUIRE_RAE_VALIDATION", None)
    os.environ.pop("ANALIZAR_IDML_RAE_VALIDATE_ONLINE", None)

    assert_true(
        lookup_rae_word("guion", allow_network=False) == "valid",
        "El validador RAE local debe reconocer 'guion' como forma normativa vigente.",
    )
    assert_true(
        lookup_rae_word("guión", allow_network=False) == "invalid",
        "El validador RAE local debe rechazar 'guión' según Ortografía RAE-ASALE 2010.",
    )
    assert_true(
        not validate_spelling_candidate_with_rae("guion", "guión", allow_network=False),
        "El validador debe bloquear candidatos que contradicen la norma RAE.",
    )
    assert_true(
        validate_spelling_candidate_with_rae("ortografia", "ortografía", allow_network=False),
        "El validador debe aceptar correcciones confirmadas por la capa normativa local.",
    )

    os.environ["ANALIZAR_IDML_REQUIRE_RAE_VALIDATION"] = "1"
    assert_true(
        not validate_spelling_candidate_with_rae("palabrainventada", "palabra", allow_network=False),
        "En modo estricto, el validador debe rechazar candidatos no confirmados por RAE/cache normativa.",
    )

    sys.stdout.write("Analizar IDML RAE validator OK.\n")


if __name__ == "__main__":
    main()
