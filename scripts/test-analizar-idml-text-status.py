#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.pages import _classify_text_frame_status


def assert_equal(actual, expected, message):
    if actual != expected:
        raise AssertionError(f"{message}\nactual={actual!r}\nexpected={expected!r}")


def main():
    page_rect = {"x1": 0, "y1": 0, "x2": 600, "y2": 800}

    assert_equal(
        _classify_text_frame_status(
            {"x1": 20, "y1": 20, "x2": 580, "y2": 780},
            page_rect,
            False,
        ),
        "correcto",
        "Un marco dentro de página debe ser correcto.",
    )

    assert_equal(
        _classify_text_frame_status(
            {"x1": 20, "y1": 20, "x2": 580, "y2": 840},
            page_rect,
            False,
        ),
        "correcto",
        "Un marco que rebasa por geometría no debe marcarse como fuera/parcial.",
    )

    assert_equal(
        _classify_text_frame_status(
            {"x1": 900, "y1": 900, "x2": 1000, "y2": 1000},
            page_rect,
            False,
        ),
        "correcto",
        "Un marco en pasteboard no debe reportarse como hallazgo de texto.",
    )

    assert_equal(
        _classify_text_frame_status(
            {"x1": 20, "y1": 20, "x2": 580, "y2": 780},
            page_rect,
            True,
        ),
        "desbordado",
        "Solo TextFrame.Overflows=true debe producir desbordado.",
    )

    print("Text status IDML regression checks passed.")


if __name__ == "__main__":
    main()
