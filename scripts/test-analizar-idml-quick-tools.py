#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.package import open_idml
from backend.python.analizar_idml.pipeline import _build_swatch_lookup, _extract_field_profiles
from backend.python.analizar_idml.quick_tools import (
    _build_style_alias,
    analyze_idml_quick_orthotypography,
    build_idml_template_from_file,
)
from backend.python.analizar_idml.styles import parse_designmap, parse_styles


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    assert_true(
        _build_style_alias("01_04_CAMPO FORMATIVO", "paragraph") == "campo_formativo",
        "La plantilla desde archivo debe mapear Campo formativo al alias editorial campo_formativo.",
    )
    assert_true(
        _build_style_alias("Campo formativo - variación", "paragraph") == "campo_formativo",
        "Las variaciones de nombre Campo formativo deben conservar el alias editorial campo_formativo.",
    )
    swatch_lookup = _build_swatch_lookup([
        {
            "name": "CF LENGUAJES",
            "cmyk": "62,3,0,0",
            "hex": "#49c7ef",
        }
    ])
    swatch_profile_page = {
        "content": {"otro": []},
        "masterContent": {"otro": []},
        "textSwatches": [],
        "frameSwatches": ["CF LENGUAJES"],
    }
    profiles = _extract_field_profiles(swatch_profile_page, swatch_lookup, alias_index={})
    assert_true(
        profiles and profiles[0].get("label") == "Lenguaje y Comunicación",
        "Campo formativo debe detectarse por swatch de objeto cuando no existe texto con estilo campo_formativo.",
    )
    assert_true(
        profiles[0].get("swatchName") == "CF LENGUAJES" and profiles[0].get("source") == "swatch",
        "El perfil debe conservar el swatch real de unidad normal y marcar fuente swatch.",
    )

    sample = ROOT / "public/analizarPDF/EEFESPPRI_10REV_TRIM1_P1_LA_U1.idml"
    assert_true(sample.exists(), "Debe existir el IDML de muestra para pruebas rápidas.")

    template = build_idml_template_from_file(str(sample), {})
    entries = template.get("entries") or []
    paragraph_entries = [entry for entry in entries if entry.get("styleKind") == "paragraph"]
    character_entries = [entry for entry in entries if entry.get("styleKind") == "character"]

    with open_idml(str(sample)) as archive:
        designmap = parse_designmap(archive)
        styles = parse_styles(archive, designmap.get("stylesSource") or "Resources/Styles.xml")
    declared_style_count = len(styles.get("paragraphStyles") or []) + len(styles.get("characterStyles") or [])

    assert_true(template.get("ok") is True, "La extracción de plantilla debe responder ok.")
    assert_true(len(entries) > 0, "La plantilla debe incluir estilos usados.")
    assert_true(len(entries) < declared_style_count, "La plantilla debe descartar estilos no usados.")
    assert_true(paragraph_entries, "La plantilla debe incluir estilos de párrafo usados.")
    assert_true(character_entries, "La plantilla debe incluir estilos de carácter usados.")
    assert_true(
        all(entry.get("styleName") and entry.get("alias") for entry in entries),
        "Cada entrada de plantilla debe incluir alias y styleName.",
    )

    quick = analyze_idml_quick_orthotypography(str(sample), {})
    pages = quick.get("pages") or []
    assert_true(quick.get("status") == "completed", "El análisis rápido debe quedar completed.")
    assert_true("paginationIssues" not in quick, "El análisis rápido no debe incluir paginación.")
    assert_true("sectionIssues" not in quick, "El análisis rápido no debe incluir secciones.")
    assert_true("colorIssues" not in quick, "El análisis rápido no debe incluir colores.")
    assert_true("recortableIssues" not in quick, "El análisis rápido no debe incluir recortables.")
    assert_true(
        all((page.get("issues") or []) for page in pages),
        "El análisis rápido solo debe mostrar páginas con errores.",
    )
    for page in pages:
        for issue in page.get("issues") or []:
            assert_true(issue.get("styleName"), "Cada hallazgo rápido debe conservar styleName.")
            assert_true(issue.get("paragraphText"), "Cada hallazgo rápido debe conservar paragraphText.")
            assert_true(issue.get("excerpt"), "Cada hallazgo rápido debe conservar excerpt.")

    sys.stdout.write("Analizar IDML quick tools OK.\n")


if __name__ == "__main__":
    main()
