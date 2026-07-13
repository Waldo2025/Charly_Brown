#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.python.analizar_idml.recortables import (
    _build_external_asset_destination_index,
    _build_recortable_checks,
    _extract_linked_asset_mentions,
)


def assert_equal(actual, expected, message):
    if actual != expected:
        raise AssertionError(f"{message}\nactual={actual!r}\nexpected={expected!r}")


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def build_destination_page(page_name="203", text="Recortable 1aT1"):
    return {
        "pageName": page_name,
        "footerMarkers": {},
        "pageItems": [],
        "content": {
            "otros": [
                {
                    "text": text,
                    "styleName": "TITULO",
                }
            ]
        },
    }


def build_destination_page_with_footer(page_name="205"):
    return build_destination_page(
        page_name=page_name,
        text="Recortable 1bT1\nRecortables Nivel 4 Trimestre 1 Unidad 1",
    )


def build_origin_page(page_name="37", text="Recortable 1aT1"):
    return {
        "pageName": page_name,
        "footerMarkers": {},
        "pageItems": [],
        "recortableSummary": {
            "originCodes": ["Recortable 1aT1"],
        },
        "content": {
            "otros": [
                {
                    "text": text,
                    "styleName": "08_01_COMPETENCIA",
                }
            ]
        },
    }


def build_origin_page_with_competencia_and_title(page_name="14"):
    return {
        "pageName": page_name,
        "footerMarkers": {},
        "pageItems": [],
        "content": {
            "títulos": [
                {
                    "text": "Más allá de las fronteras",
                    "styleName": "01_00_TITULO LITERATURAS Y EJERCICIOS",
                }
            ],
            "instrucciones": [
                {
                    "text": "Observa el anexo PbT1. Utiliza tu recortable PbT1. Evalúa tu desempeño con la rúbrica del recortable PcT1.",
                    "styleName": "02_01_00 INSTRUCCION",
                }
            ],
            "otros": [
                {
                    "text": "Anexo digital RECORTABLE",
                    "styleName": "08_01_COMPETENCIA",
                },
                {
                    "text": "competencia:",
                    "styleName": "08_01_COMPETENCIA",
                },
            ],
        },
    }


def build_origin_page_with_named_anexo(page_name="11"):
    return {
        "pageName": page_name,
        "footerMarkers": {},
        "pageItems": [],
        "content": {
            "instrucciones": [
                {
                    "text": "Observa atentamente el anexo PaT1 “Elementos de un ecosistema” y realiza lo siguiente:",
                    "styleName": "02_01_00 INSTRUCCION",
                },
                {
                    "text": "Utiliza el recortable PaT1.",
                    "styleName": "02_01_00 INSTRUCCION",
                },
            ],
            "otros": [
                {
                    "text": "Anexo digital RECORTABLE",
                    "styleName": "08_01_COMPETENCIA",
                },
                {
                    "text": "competencia:",
                    "styleName": "08_01_COMPETENCIA",
                },
            ],
        },
    }


def build_origin_page_with_anexo_and_visual_recortable_marker(page_name="47"):
    return {
        "pageName": page_name,
        "pageRect": {"x1": 0, "y1": 0, "x2": 600, "y2": 800},
        "footerMarkers": {},
        "pageItems": [
            {
                "appliedObjectStyle": "ObjectStyle/PRESEF COL2 Persiana tablero",
                "frameRect": {"x1": 540, "y1": 80, "x2": 580, "y2": 120},
            }
        ],
        "content": {
            "instrucciones": [
                {
                    "text": "Observa el anexo 1dT1 “Patrones en las tablas”. Colorea los cuadritos según algunas tablas de multiplicar.",
                    "styleName": "02_01_00 INSTRUCCION",
                }
            ],
        },
    }


def main():
    assert_equal(
        _extract_linked_asset_mentions("pega tu recortable aquí"),
        [],
        "La zona de pegado 'pega tu recortable aquí' no debe crear Recortable aqu.",
    )
    assert_equal(
        _extract_linked_asset_mentions("Observa la ficha de trabajo y responde."),
        [],
        "Una frase genérica 'ficha de...' no debe crear Ficha de.",
    )
    assert_equal(
        _extract_linked_asset_mentions("Completa la ficha descriptiva de tu proyecto."),
        [],
        "Una ficha sin código editorial no debe crear badge ni hallazgo.",
    )
    assert_equal(
        _extract_linked_asset_mentions("Revisa la ficha PaT1 y responde."),
        [{"kind": "ficha", "code": "PaT1", "label": "Ficha PaT1"}],
        "Una ficha con código editorial sí debe detectarse.",
    )
    assert_equal(
        _extract_linked_asset_mentions("Utiliza el recortable 2aT1."),
        [{"kind": "recortable", "code": "2aT1", "label": "Recortable 2aT1"}],
        "Las referencias reales con código editorial deben seguir detectándose.",
    )

    destination_session = {
        "bibliographicInfo": {
            "unidad": "Recortables",
            "revisionNumero": "F1",
            "recortableRole": "destination",
        },
        "analysisContext": {
            "revisionId": "rev_dest",
            "recortableRole": "destination",
        },
        "revisions": [
            {
                "id": "rev_dest",
                "unidad": "Recortables",
                "revisionNumero": "F1",
                "recortableRole": "destination",
                "title": "Recortables · F1",
                "files": [
                    {
                        "id": "file_dest",
                        "documentName": "recortables.idml",
                        "result": {
                            "stats": {
                                "pageReports": [build_destination_page()],
                            }
                        },
                    }
                ],
            }
        ],
    }

    issues, pages = _build_recortable_checks(
        [build_destination_page()],
        alias_index={},
        session=destination_session,
    )
    assert_equal(issues, [], "Un archivo Recortables destino no debe generar errores por falta de origen.")
    summary = (pages[0].get("recortableSummary") or {})
    assert_equal(summary.get("originCodes") or [], [], "El archivo destino no debe marcar códigos de origen.")
    assert_equal(
        summary.get("resolvedDestinations") or [],
        [{"code": "Recortable 1aT1", "kind": "recortable", "destination": "203", "status": "pending"}],
        "El título de la página destino debe declarar el código sin exigir página de origen."
    )

    destination_index = _build_external_asset_destination_index(destination_session)
    targets = destination_index.get("recortable:1at1") or []
    assert_true(targets, "La ficha Recortables destino debe alimentar el índice de destinos externos.")
    assert_equal(targets[0].get("pageName"), "203", "Sin página declarada, el índice externo debe usar la página física del recortable destino.")

    footer_issues, footer_pages = _build_recortable_checks(
        [build_destination_page_with_footer()],
        alias_index={},
        session=destination_session,
    )
    assert_equal(footer_issues, [], "El pie de página de Recortables destino no debe crear errores.")
    footer_summary = (footer_pages[0].get("recortableSummary") or {})
    assert_equal(
        footer_summary.get("resolvedDestinations") or [],
        [{"code": "Recortable 1bT1", "kind": "recortable", "destination": "205", "status": "pending"}],
        "El pie de página 'Recortables Nivel...' no debe crear un segundo destino Recortable Nivel."
    )

    source_session = {
        "bibliographicInfo": {
            "unidad": "Unidad 1",
            "revisionNumero": "F1",
        },
        "analysisContext": {
            "revisionId": "rev_source",
        },
        "revisions": [
            {
                "id": "rev_source",
                "unidad": "Unidad 1",
                "revisionNumero": "F1",
                "title": "Unidad 1 · F1",
                "files": [
                    {
                        "id": "file_source",
                        "documentName": "unidad-1.idml",
                        "result": {
                            "stats": {
                                "pageReports": [build_origin_page(page_name="37")],
                            }
                        },
                    }
                ],
            },
            destination_session["revisions"][0],
        ],
    }

    source_issues, source_pages = _build_recortable_checks(
        [build_origin_page(page_name="37")],
        alias_index={},
        session=source_session,
    )
    assert_true(source_issues and source_issues[0].get("ok") is True, "Cuando origen y destino comparten código, el match debe marcarse como correcto.")
    assert_true(
        "no hacen match" not in (source_issues[0].get("message") or "").lower(),
        "El match correcto por código no debe depender de comparar página origen contra destino."
    )

    destination_with_origin_session = {
        **destination_session,
        "revisions": [source_session["revisions"][0], destination_session["revisions"][0]],
    }
    destination_with_origin_issues, destination_with_origin_pages = _build_recortable_checks(
        [build_destination_page()],
        alias_index={},
        session=destination_with_origin_session,
    )
    assert_equal(destination_with_origin_issues, [], "El destino recortable con origen externo no debe generar error de página origen.")
    destination_summary = destination_with_origin_pages[0].get("recortableSummary") or {}
    assert_equal(
        destination_summary.get("resolvedDestinations") or [],
        [{"code": "Recortable 1aT1", "kind": "recortable", "destination": "203", "status": "match"}],
        "El destino recortable debe cambiar a match por código cuando existe origen externo con el mismo código."
    )

    mismatch_issues, mismatch_pages = _build_recortable_checks(
        [build_origin_page(page_name="38")],
        alias_index={},
        session=source_session,
    )
    assert_true(mismatch_issues and mismatch_issues[0].get("ok") is True, "El origen debe seguir haciendo match por código aunque cambie la página.")

    source_page_14_issues, source_page_14_pages = _build_recortable_checks(
        [build_origin_page_with_competencia_and_title()],
        alias_index={},
        session=source_session,
    )
    source_page_14_summary = source_page_14_pages[0].get("recortableSummary") or {}
    assert_equal(
        source_page_14_summary.get("destinationCodes") or [],
        [],
        "La página origen no debe declarar destino con su misma página aunque tenga estilo de título 01_00."
    )
    assert_true(
        "Recortable competencia" not in (source_page_14_summary.get("originCodes") or []),
        "El estilo 08_01_COMPETENCIA no debe convertir 'competencia:' en código de recortable."
    )
    assert_true(
        "Anexo digital" not in (source_page_14_summary.get("originCodes") or []),
        "El estilo 08_01_COMPETENCIA no debe convertir 'Anexo digital' en código de anexo."
    )
    assert_true(
        all("pág. 14 no contiene" not in (issue.get("message") or "") for issue in source_page_14_issues),
        "La página origen no debe validarse como si fuera página destino."
    )

    source_page_11_issues, source_page_11_pages = _build_recortable_checks(
        [build_origin_page_with_named_anexo()],
        alias_index={},
        session=source_session,
    )
    source_page_11_summary = source_page_11_pages[0].get("recortableSummary") or {}
    assert_true(
        "Anexo PaT1" in (source_page_11_summary.get("originCodes") or []),
        "El anexo real con código PaT1 debe conservarse como origen."
    )
    assert_true(
        "Anexo digital" not in (source_page_11_summary.get("originCodes") or []),
        "El texto de pie/competencia 'Anexo digital' no debe entrar como anexo real."
    )
    assert_equal(
        (source_page_11_summary.get("codeTitles") or {}).get("Anexo PaT1"),
        "Elementos de un ecosistema",
        "El extractor debe conservar el nombre del anexo real para usarlo como tooltip."
    )
    assert_true(
        any(
            (issue.get("code") or "") == "Anexo PaT1"
            and str(issue.get("severity") or "").lower() == "pending"
            for issue in source_page_11_pages[0].get("recortableIssues") or []
        ),
        "Un anexo origen sin ficha/archivo destino debe quedar pendiente, no como match verde."
    )
    assert_true(
        not any(
            (link.get("code") or "") == "Anexo PaT1"
            and str(link.get("status") or "").lower() == "match"
            for link in source_page_11_summary.get("resolvedLinks") or []
        ),
        "Un anexo sin destino externo no debe generar resolvedLinks status=match."
    )

    source_page_47_issues, source_page_47_pages = _build_recortable_checks(
        [build_origin_page_with_anexo_and_visual_recortable_marker()],
        alias_index={},
        session=source_session,
    )
    source_page_47_summary = source_page_47_pages[0].get("recortableSummary") or {}
    assert_true(
        "Anexo 1dT1" in (source_page_47_summary.get("originCodes") or []),
        "La página con mención textual explícita de anexo debe conservar Anexo 1dT1."
    )
    assert_true(
        "Recortable 1dT1" not in (source_page_47_summary.get("originCodes") or []),
        "La heurística visual no debe inventar Recortable 1dT1 cuando el texto explícito dice Anexo 1dT1."
    )
    assert_true(
        all((issue.get("code") or "") != "Recortable 1dT1" for issue in source_page_47_issues),
        "El falso Recortable 1dT1 no debe generar pendiente ni issue."
    )

    sys.stdout.write("Recortable destination regression OK.\n")


if __name__ == "__main__":
    main()
