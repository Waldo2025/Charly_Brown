import base64
import io
from time import perf_counter
from collections import Counter

from PIL import Image

from .colors import find_color_issues
from .document import build_document_summary
from .gemini_verifier import GeminiVerifier
from .orthotypography import find_orthotypography_issues
from .package import open_idml
from .pagination import build_pagination_report, find_pagination_issues
from .pages import parse_pages, _classify_text_frame_status
from .sections import find_section_issues
from .spelling import find_spelling_issues
from .stories import AUTO_PAGE_NUMBER_TOKEN, parse_stories
from .master_spreads import parse_master_spreads
from .styles import parse_designmap, parse_styles
from .swatches import parse_swatches


FIELD_FORMATIVO_CATALOG = [
    {
        "label": "Lenguaje y Comunicación",
        "match": "campo formativo lenguaje y comunicación",
        "swatchName": "A_CAMPO FORMATIVO_LENGUAJES",
    },
    {
        "label": "Ética, Naturaleza y Sociedades",
        "match": "campo formativo ética, naturaleza y sociedades",
        "swatchName": "A_CAMPO FORMATIVO ETICA NAT",
    },
    {
        "label": "De lo Humano y lo Comunitario",
        "match": "campo formativo de lo humano y lo comunitario",
        "swatchName": "A_CAMPO FORMATIVO_ DE LO HUMANO",
    },
    {
        "label": "Saberes y Pensamiento Científico",
        "match": "campo formativo saberes y pensamiento científico",
        "swatchName": "A_CAMPO FORMATIVO_SABERES CIENT",
    },
]

LEGACY_ALIAS_DEFAULTS = {
    "campo_formativo": {"paragraph": ["01_04_CAMPO FORMATIVO"]},
    "titulo_seccion": {"paragraph": ["01_00_TITULO"]},
    "nombre_seccion": {"paragraph": ["01_05 TITULO SECCION Y COMPETENCIA"]},
    "titulo_literaturas": {"paragraph": ["01_00_TITULO LITERATURAS Y EJERCICIOS"]},
    "recortable_indicator": {"paragraph": ["08_01_COMPETENCIA"]},
    "recortable_destination": {"paragraph": ["01_00_TITULO LITERATURAS Y EJERCICIOS"]},
    "recortable_footer": {"paragraph": ["12_01 PIE DE PAGINA DERCHO"]},
    "habilidad": {"paragraph": ["08_05_02 HABILIDADES"]},
    "habilidad_verso": {"paragraph": ["PRESEF COL 2 HABILIDADES VERSO"]},
    "habilidad_recto": {"paragraph": ["PRESEF COL 2 HABILIDAD RECTO"]},
    "pie_pagina": {"paragraph": ["PRESEF COL2 PIE DE PAGINA VERSO"]},
    "pie_pagina_recto": {"paragraph": ["PRESEF COL 2 PIE DE PAGINA RECTO"]},
    "pie_pagina_verso": {"paragraph": ["PRESEF COL2 PIE DE PAGINA VERSO"]},
    "folio_unidad": {"character": ["Z_FOLIO_UNIDAD"]},
    "folio_trimestre": {"character": ["Z_FOLIO_TIRMESTRE"]},
    "folio_nivel": {"character": ["Z_FOLIO_NIVEL"]},
    "folio_numero": {"character": ["Z_FOLIOS", "Z_FOLIOS RECORTABLES"]},
}

LINKED_ASSET_TYPES = (
    ("recortable", "recortable", "Recortable", "Recortables"),
    ("ficha", "ficha", "Ficha", "Fichas"),
    ("anexo", "anexo", "Anexo", "Anexos"),
    ("video", "video", "Video", "Videos"),
)

FIRST_GRADE_GEMINI_VISUAL_KINDS = {"recortable", "anexo", "ficha", "video"}
UNIT_NORMAL_FOOTER_STYLE_FAMILY = {
    "PRESEF COL2 PIE DE PAGINA VERSO",
    "PRESEF COL 2 PIE DE PAGINA RECTO",
}


def _normalize_story_text(text):
    return " ".join(str(text or "").split()).strip().lower()


def _normalize_style_name(text):
    return str(text or "").strip().upper()


def _normalize_object_style_name(text):
    raw = str(text or "").strip()
    if not raw:
        return ""
    if "/" in raw:
        raw = raw.split("/", 1)[-1]
    return _normalize_style_name(raw)


def _normalize_page_scope(value=""):
    normalized = str(value or "").strip().lower()
    if normalized in {"even", "odd"}:
        return normalized
    return "both"


def _normalize_target_page(value=""):
    return _normalize_page_list(value, zero_means_empty=True)


def _normalize_exclude_target_page(value=""):
    return _normalize_page_list(value, zero_means_empty=True, fallback_zero=True)


def _normalize_page_list(value="", zero_means_empty=False, fallback_zero=False):
    raw_tokens = str(value or "").split(",")
    normalized = []
    seen = set()
    for token in raw_tokens:
        token = str(token or "").strip()
        if not token:
            continue
        try:
            numeric = int(token)
        except (TypeError, ValueError):
            continue
        if numeric < 0 or numeric > 999:
            continue
        if zero_means_empty and numeric == 0:
            continue
        if numeric in seen:
            continue
        seen.add(numeric)
        normalized.append(str(numeric))
    if not normalized:
        return "0" if fallback_zero else ""
    return ", ".join(normalized)


def _parse_normalized_page_list(value=""):
    return {
        str(int(token))
        for token in str(value or "").split(",")
        if str(token or "").strip().isdigit()
    }


def _page_matches_scope(page=None, scope="both", target_page="", exclude_target_page="0"):
    normalized_exclude_target_page = _normalize_exclude_target_page(exclude_target_page)
    try:
        relative_page = str(int((page or {}).get("pageSequence") or 0))
    except (TypeError, ValueError):
        relative_page = ""
    exclude_pages = _parse_normalized_page_list(normalized_exclude_target_page)
    if relative_page and exclude_pages and relative_page in exclude_pages:
        return False
    normalized_target_page = _normalize_target_page(target_page)
    target_pages = _parse_normalized_page_list(normalized_target_page)
    if target_pages:
        if not relative_page or relative_page not in target_pages:
            return False
    normalized_scope = _normalize_page_scope(scope)
    if normalized_scope == "both":
        return True
    try:
        page_number = int(str((page or {}).get("pageName") or "").strip())
    except (TypeError, ValueError):
        return True
    if normalized_scope == "even":
        return page_number % 2 == 0
    return page_number % 2 == 1


def _should_suppress_partial_text_status(block=None, paragraph_style_name="", alias_index=None):
    if bool((block or {}).get("inTable")):
        return True
    style_name = _normalize_style_name(paragraph_style_name)
    if not style_name:
        return False
    for alias in (
        "habilidad",
        "habilidad_verso",
        "habilidad_recto",
        "habilidad_caracter",
        "pie_pagina",
        "pie_pagina_recto",
        "pie_pagina_verso",
        "folio_impar",
        "folio_par",
    ):
        if _has_alias_style(alias_index, alias, "paragraph", style_name):
            return True
    normalized = style_name.lower()
    if "solucionario" in normalized or "solicionario" in normalized:
        return True
    return False


def _build_mapping_alias_index(session):
    mapping = ((session or {}).get("analysisMapping")) or {}
    explicit_entries = [
        entry for entry in (mapping.get("entries") or [])
        if isinstance(entry, dict) and entry.get("enabled") is not False
    ]
    alias_index = {}
    if not explicit_entries:
        for alias, config in LEGACY_ALIAS_DEFAULTS.items():
            alias_index[alias] = {
                "paragraph": list(config.get("paragraph") or []),
                "character": list(config.get("character") or []),
                "swatch": list(config.get("swatch") or []),
                "paragraphScope": {},
                "characterScope": {},
                "swatchScope": {},
                "paragraphTargetPage": {},
                "characterTargetPage": {},
                "swatchTargetPage": {},
                "paragraphExcludeTargetPage": {},
                "characterExcludeTargetPage": {},
                "swatchExcludeTargetPage": {},
            }
    for entry in explicit_entries:
        if not isinstance(entry, dict) or entry.get("enabled") is False:
            continue
        alias = str(entry.get("alias") or "").strip()
        style_name = _normalize_style_name(entry.get("styleName") or "")
        raw_style_kind = str(entry.get("styleKind") or "").strip().lower()
        style_kind = raw_style_kind if raw_style_kind in {"character", "swatch"} else "paragraph"
        page_scope = _normalize_page_scope(entry.get("pageScope") or "both")
        target_page = _normalize_target_page(entry.get("targetPage") or "")
        exclude_target_page = _normalize_exclude_target_page(entry.get("excludeTargetPage") or "0")
        if not alias or not style_name:
            continue
        bucket = alias_index.setdefault(alias, {
            "paragraph": [],
            "character": [],
            "swatch": [],
            "paragraphScope": {},
            "characterScope": {},
            "swatchScope": {},
            "paragraphTargetPage": {},
            "characterTargetPage": {},
            "swatchTargetPage": {},
            "paragraphExcludeTargetPage": {},
            "characterExcludeTargetPage": {},
            "swatchExcludeTargetPage": {},
        })
        if style_name not in bucket[style_kind]:
            bucket[style_kind].append(style_name)
        bucket[f"{style_kind}Scope"][style_name] = page_scope
        bucket[f"{style_kind}TargetPage"][style_name] = target_page
        bucket[f"{style_kind}ExcludeTargetPage"][style_name] = exclude_target_page
    return alias_index


def _expand_alias_index_with_style_inheritance(alias_index=None, styles=None, allow_name_variants=True):
    import re

    expanded = {}
    for alias, bucket in (alias_index or {}).items():
        expanded[alias] = {
            "paragraph": list(bucket.get("paragraph") or []),
            "character": list(bucket.get("character") or []),
            "swatch": list(bucket.get("swatch") or []),
            "paragraphScope": dict(bucket.get("paragraphScope") or {}),
            "characterScope": dict(bucket.get("characterScope") or {}),
            "swatchScope": dict(bucket.get("swatchScope") or {}),
            "paragraphTargetPage": dict(bucket.get("paragraphTargetPage") or {}),
            "characterTargetPage": dict(bucket.get("characterTargetPage") or {}),
            "swatchTargetPage": dict(bucket.get("swatchTargetPage") or {}),
            "paragraphExcludeTargetPage": dict(bucket.get("paragraphExcludeTargetPage") or {}),
            "characterExcludeTargetPage": dict(bucket.get("characterExcludeTargetPage") or {}),
            "swatchExcludeTargetPage": dict(bucket.get("swatchExcludeTargetPage") or {}),
        }

    def expand_style_bucket(style_kind, style_entries):
        entries = style_entries or []
        by_self = {
            str((entry or {}).get("self") or "").strip(): entry
            for entry in entries
            if str((entry or {}).get("self") or "").strip()
        }
        normalized_names = {
            str((entry or {}).get("self") or "").strip(): _normalize_style_name((entry or {}).get("name") or "")
            for entry in entries
            if str((entry or {}).get("self") or "").strip()
        }
        lineage_cache = {}

        def resolve_lineage(style_self="", trail=None):
            style_self = str(style_self or "").strip()
            if not style_self:
                return set()
            if style_self in lineage_cache:
                return set(lineage_cache[style_self])
            if trail is None:
                trail = set()
            if style_self in trail:
                return set()
            trail = set(trail)
            trail.add(style_self)
            entry = by_self.get(style_self) or {}
            lineage = set()
            own_name = normalized_names.get(style_self) or ""
            if own_name:
                lineage.add(own_name)
            based_on_ref = _normalize_style_ref((entry or {}).get("basedOn") or "")
            if based_on_ref and based_on_ref in by_self:
                lineage.update(resolve_lineage(based_on_ref, trail))
            lineage_cache[style_self] = set(lineage)
            return lineage

        descendants_by_ancestor = {}
        for style_self, own_name in normalized_names.items():
            if not own_name:
                continue
            for ancestor_name in resolve_lineage(style_self):
                descendants_by_ancestor.setdefault(ancestor_name, set()).add(own_name)

        for alias, bucket in expanded.items():
            current = {
                _normalize_style_name(value)
                for value in (bucket.get(style_kind) or [])
                if _normalize_style_name(value)
            }
            resolved = set(current)
            for mapped_name in current:
                resolved.update(descendants_by_ancestor.get(mapped_name) or set())
                if allow_name_variants and mapped_name:
                    variant_pattern = re.compile(rf"(?<![A-Z0-9]){re.escape(mapped_name)}(?![A-Z0-9])")
                    for candidate_name in normalized_names.values():
                        if candidate_name and variant_pattern.search(candidate_name):
                            resolved.add(candidate_name)
                            bucket[f"{style_kind}Scope"].setdefault(candidate_name, bucket[f"{style_kind}Scope"].get(mapped_name, "both"))
                            bucket[f"{style_kind}TargetPage"].setdefault(candidate_name, bucket[f"{style_kind}TargetPage"].get(mapped_name, ""))
                            bucket[f"{style_kind}ExcludeTargetPage"].setdefault(candidate_name, bucket[f"{style_kind}ExcludeTargetPage"].get(mapped_name, "0"))
            bucket[style_kind] = sorted(resolved)

    expand_style_bucket("paragraph", (styles or {}).get("paragraphStyles") or [])
    expand_style_bucket("character", (styles or {}).get("characterStyles") or [])
    return expanded


def _has_alias_style(alias_index, alias="", kind="paragraph", style_name="", page=None):
    normalized = _normalize_style_name(style_name)
    if not normalized:
        return False
    bucket = (alias_index or {}).get(alias) or {}
    available = {_normalize_style_name(value) for value in (bucket.get(kind) or [])}
    if normalized not in available:
        return False
    scope = ((bucket.get(f"{kind}Scope") or {}).get(normalized)) or "both"
    target_page = ((bucket.get(f"{kind}TargetPage") or {}).get(normalized)) or ""
    exclude_target_page = ((bucket.get(f"{kind}ExcludeTargetPage") or {}).get(normalized)) or "0"
    return _page_matches_scope(page, scope, target_page, exclude_target_page)


def _has_explicit_mapping(session=None):
    mapping = ((session or {}).get("analysisMapping")) or {}
    return any(
        isinstance(entry, dict) and entry.get("enabled") is not False and str(entry.get("alias") or "").strip()
        for entry in (mapping.get("entries") or [])
    )


def _get_unit_normal_footer_style_names(alias_index=None):
    configured = set()
    for alias in ("pie_pagina", "pie_pagina_recto", "pie_pagina_verso"):
        bucket = (alias_index or {}).get(alias) or {}
        configured.update(
            _normalize_style_name(value)
            for value in (bucket.get("paragraph") or [])
            if _normalize_style_name(value)
        )
    if configured & UNIT_NORMAL_FOOTER_STYLE_FAMILY:
        configured.update(UNIT_NORMAL_FOOTER_STYLE_FAMILY)
    return configured


def _matches_unit_normal_footer_style(alias_index=None, style_name=""):
    normalized = _normalize_style_name(style_name)
    if not normalized:
        return False
    return normalized in _get_unit_normal_footer_style_names(alias_index=alias_index)


def _build_mapping_swatch_entries(alias_index=None):
    entries = []
    for alias, bucket in (alias_index or {}).items():
        for swatch_name in (bucket.get("swatch") or []):
            normalized = _normalize_style_name(swatch_name)
            if not normalized:
                continue
            entries.append({
                "alias": str(alias or "").strip(),
                "swatchName": normalized,
                "pageScope": ((bucket.get("swatchScope") or {}).get(normalized)) or "both",
                "targetPage": ((bucket.get("swatchTargetPage") or {}).get(normalized)) or "",
                "excludeTargetPage": ((bucket.get("swatchExcludeTargetPage") or {}).get(normalized)) or "0",
            })
    return entries


def _build_swatch_lookup(swatches):
    lookup = {}
    for swatch in swatches or []:
        name = str((swatch or {}).get("name") or "").strip()
        if name:
            lookup[name] = swatch
    return lookup


def _select_semantic_story_blocks(stories, limit=18):
    ranked = sorted(
        (entry for entry in (stories or []) if len(str((entry or {}).get("text") or "").strip()) >= 80),
        key=lambda entry: len(str(entry.get("text") or "")),
        reverse=True,
    )
    selected = []
    seen = set()
    for entry in ranked:
        normalized = _normalize_story_text(entry.get("text"))
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        selected.append(entry)
        if len(selected) >= limit:
            break
    return selected


def _build_configuration_warnings(session):
    warnings = []
    sections = ((((session or {}).get("indexConfig")) or {}).get("sections")) or []
    palette = ((((session or {}).get("colorConfig")) or {}).get("palette")) or []
    if not sections:
        warnings.append("No hay secciones configuradas. La validación de checklist estructural está desactivada.")
    if not palette:
        warnings.append("No hay paleta configurada. La validación de colores solo reporta inventario, no discrepancias.")
    mapping = ((session or {}).get("analysisMapping")) or {}
    alias_index = _build_mapping_alias_index(session)
    if mapping:
        required_aliases = ["titulo_seccion", "instruccion", "texto"]
        missing = [alias for alias in required_aliases if not ((alias_index.get(alias) or {}).get("paragraph") or (alias_index.get(alias) or {}).get("character"))]
        if missing:
            warnings.append(f"Faltan aliases requeridos en el mapeo activo: {', '.join(missing)}.")
    return warnings


def _build_page_preview(pages, limit=12):
    return [
        {
            "pageId": page.get("pageId") or "",
            "pageName": page.get("pageName") or "",
            "spreadId": page.get("spreadId") or "",
            "appliedMaster": page.get("appliedMaster") or "",
        }
        for page in (pages or [])[:limit]
    ]


def _build_swatch_inventory(swatches, limit=24):
    return [
        {
            "name": swatch.get("name") or "",
            "space": swatch.get("space") or "",
            "model": swatch.get("model") or "",
            "cmyk": swatch.get("cmyk") or "",
            "hex": swatch.get("hex") or "",
        }
        for swatch in (swatches or [])[:limit]
    ]


def _build_style_lookup(entries):
    return {
        str((entry or {}).get("self") or "").strip(): str((entry or {}).get("name") or "").strip()
        for entry in (entries or [])
        if str((entry or {}).get("self") or "").strip()
    }


def _normalize_style_ref(value=""):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "/" in raw:
        return raw.split("/", 1)[-1]
    return raw


def _normalize_color_ref(value=""):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "/" in raw:
        return raw.split("/", 1)[-1]
    return raw


def _classify_paragraph_kind(style_name="", alias_index=None):
    normalized = str(style_name or "").strip().lower()
    if not normalized:
        return "otro"
    if _has_alias_style(alias_index, "titulo_unidad", "paragraph", style_name) or _has_alias_style(alias_index, "titulo_seccion", "paragraph", style_name):
        return "títulos"
    if _has_alias_style(alias_index, "titulo_literaturas", "paragraph", style_name) or _has_alias_style(alias_index, "titulo_lectura", "paragraph", style_name):
        return "subtítulos"
    if _has_alias_style(alias_index, "instruccion", "paragraph", style_name):
        return "instrucciones"
    if _has_alias_style(alias_index, "subinstruccion", "paragraph", style_name):
        return "subinstrucciones"
    if (
        _has_alias_style(alias_index, "texto", "paragraph", style_name) or
        _has_alias_style(alias_index, "caja_amarilla_texto", "paragraph", style_name) or
        _has_alias_style(alias_index, "caja_amarilla_literatura", "paragraph", style_name) or
        _has_alias_style(alias_index, "trazos_gris", "paragraph", style_name) or
        _has_alias_style(alias_index, "trazos_letras", "paragraph", style_name)
    ):
        return "párrafos normales"
    if "subtitulo" in normalized:
        return "subtítulos"
    if "titulo" in normalized and "subtitulo" not in normalized:
        return "títulos"
    if "instruccion" in normalized:
        return "instrucciones"
    if "numerado" in normalized or "bullets" in normalized or "nivel 1" in normalized or "nivel 2" in normalized or "nivel 3" in normalized:
        return "subinstrucciones"
    if "texto" in normalized or "tablas cuerpo" in normalized or "respuesta alumno" in normalized or "temario" in normalized or "cajas" in normalized or "pie de foto" in normalized:
        return "párrafos normales"
    return "otro"


def _append_block_to_page(
    page,
    story,
    block,
    story_ref,
    paragraph_lookup,
    character_lookup,
    paragraph_style_details,
    character_style_details,
    alias_index,
    from_master=False,
):
    text_status = str((story_ref or {}).get("textStatus") or "correcto").strip() or "correcto"
    if text_status == "parcialmente fuera de la página" and _should_suppress_partial_text_status(
        block,
        paragraph_lookup.get(str(block.get("paragraphStyleId") or "").strip()) or _normalize_style_ref(str(block.get("paragraphStyleId") or "").strip()),
        alias_index,
    ):
        # En tablas, pies, habilidades y solucionario el TextFrame contenedor puede
        # rebasar ligeramente la hoja sin que el contenido visible de cada bloque
        # esté realmente fuera de página.
        text_status = "correcto"
    if text_status == "fuera de la página":
        return
    paragraph_style_id = str(block.get("paragraphStyleId") or "").strip()
    paragraph_style_name = paragraph_lookup.get(paragraph_style_id) or _normalize_style_ref(paragraph_style_id)
    paragraph_style = paragraph_style_details.get(paragraph_style_id) or {}
    char_ids = [str(value or "").strip() for value in (block.get("characterStyleIds") or []) if str(value or "").strip()]
    char_names = [character_lookup.get(style_id) or _normalize_style_ref(style_id) for style_id in char_ids]
    swatches = []
    para_fill = _normalize_color_ref(paragraph_style.get("fillColor", ""))
    if para_fill:
        swatches.append(para_fill)
    for style_id in char_ids:
        char_fill = _normalize_color_ref((character_style_details.get(style_id) or {}).get("fillColor", ""))
        if char_fill:
            swatches.append(char_fill)
    unique_swatches = []
    for name in swatches:
        if name and name not in unique_swatches:
            unique_swatches.append(name)
    kind = _classify_paragraph_kind(paragraph_style_name, alias_index=alias_index)
    target_key = "masterContent" if from_master else "content"
    page[target_key][kind].append({
        "pageName": page.get("pageName") or "",
        "storyId": story.get("storyId") or "",
        "storyTitle": story.get("storyTitle") or "",
        "styleName": paragraph_style_name,
        "blockType": kind,
        "blockOrder": int(block.get("blockOrder") or 0),
        "text": str(block.get("text") or "").strip(),
        "characterStyles": char_names,
        "swatches": unique_swatches,
        "textStatus": text_status,
        "frameRect": (story_ref or {}).get("frameRect") or None,
        "fromMaster": bool(from_master),
    })
    if paragraph_style_name and paragraph_style_name not in page["paragraphStyles"]:
        page["paragraphStyles"].append(paragraph_style_name)
    for char_name in char_names:
        if char_name and char_name not in page["characterStyles"]:
            page["characterStyles"].append(char_name)
    for swatch_name in unique_swatches:
        if swatch_name and swatch_name not in page["textSwatches"]:
            page["textSwatches"].append(swatch_name)


def _iter_page_bucket_items(page, include_master=False):
    sources = [page.get("content") or {}]
    if include_master:
        sources.append(page.get("masterContent") or {})
    for source in sources:
        for bucket_items in source.values():
            for item in bucket_items or []:
                yield item


def _normalize_page_item_text(page=None, item=None):
    text = str(((item or {}).get("text")) or "").strip()
    if text == AUTO_PAGE_NUMBER_TOKEN:
        return str((page or {}).get("pageName") or "").strip()
    return text


def _page_item_sort_key(item=None):
    rect = ((item or {}).get("frameRect")) or {}
    try:
        y1 = float(rect.get("y1"))
    except (TypeError, ValueError):
        y1 = 0.0
    try:
        x1 = float(rect.get("x1"))
    except (TypeError, ValueError):
        x1 = 0.0
    try:
        block_order = int((item or {}).get("blockOrder") or 0)
    except (TypeError, ValueError):
        block_order = 0
    story_id = str((item or {}).get("storyId") or "").strip()
    return (
        round(y1 / 8.0) if y1 else 0.0,
        y1,
        x1,
        story_id,
        block_order,
        str((item or {}).get("text") or "").strip(),
    )


def _collect_alias_items(page, alias_index=None, alias="", include_master=True):
    alias_name = str(alias or "").strip()
    if not alias_name:
        return []
    bucket = (alias_index or {}).get(alias_name) or {}
    paragraph_styles = {
        _normalize_style_name(value)
        for value in (bucket.get("paragraph") or [])
        if _normalize_style_name(value) and _page_matches_scope(
            page,
            (bucket.get("paragraphScope") or {}).get(_normalize_style_name(value), "both"),
            (bucket.get("paragraphTargetPage") or {}).get(_normalize_style_name(value), ""),
        )
    }
    character_styles = {
        _normalize_style_name(value)
        for value in (bucket.get("character") or [])
        if _normalize_style_name(value) and _page_matches_scope(
            page,
            (bucket.get("characterScope") or {}).get(_normalize_style_name(value), "both"),
            (bucket.get("characterTargetPage") or {}).get(_normalize_style_name(value), ""),
        )
    }
    if alias_name == "pie_pagina" and paragraph_styles & UNIT_NORMAL_FOOTER_STYLE_FAMILY:
        paragraph_styles.update(UNIT_NORMAL_FOOTER_STYLE_FAMILY)
    if not paragraph_styles and not character_styles:
        return []
    matches = []
    seen = set()
    for item in _iter_page_bucket_items(page, include_master=include_master):
        normalized_text = _normalize_page_item_text(page, item)
        if not normalized_text:
            continue
        style_name = _normalize_style_name((item or {}).get("styleName") or "")
        char_names = {
            _normalize_style_name(value)
            for value in ((item or {}).get("characterStyles") or [])
            if _normalize_style_name(value)
        }
        if style_name not in paragraph_styles and not (character_styles & char_names):
            continue
        signature = (
            style_name,
            normalized_text,
            tuple(sorted(char_names)),
        )
        if signature in seen:
            continue
        seen.add(signature)
        enriched = dict(item or {})
        enriched["text"] = normalized_text
        matches.append(enriched)
    if alias_name in {"pie_pagina", "pie_pagina_recto", "pie_pagina_verso"}:
        non_placeholder = [
            item for item in matches
            if not str((item or {}).get("text") or "").strip().lower().startswith("pie de página")
        ]
        if non_placeholder:
            matches = non_placeholder
    return sorted(matches, key=_page_item_sort_key)


def _extract_alias_values(page, alias_index=None, include_master=True):
    values = {}
    for alias in (alias_index or {}).keys():
        items = _collect_alias_items(page, alias_index=alias_index, alias=alias, include_master=include_master)
        if not items:
            continue
        texts = [str((item or {}).get("text") or "").strip() for item in items if str((item or {}).get("text") or "").strip()]
        if texts:
            values[str(alias or "").strip()] = "\n".join(texts)
    return values


def _extract_footer_markers(page, alias_index=None, session=None, gemini_verifier=None):
    def first_line(value=""):
        for line in str(value or "").splitlines():
            clean = str(line or "").strip()
            if clean:
                return clean
        return ""

    def unique_lines(*values):
        rows = []
        seen = set()
        for value in values:
            for line in str(value or "").splitlines():
                clean = str(line or "").strip()
                key = clean.lower()
                if not clean or key in seen or clean.upper() in {"X", "XX", "XXX"}:
                    continue
                seen.add(key)
                rows.append(clean)
        return rows

    def get_rect_origin(item):
        rect = (item or {}).get("frameRect") or {}
        x1 = rect.get("x1")
        y1 = rect.get("y1")
        try:
            x_val = float(x1)
        except (TypeError, ValueError):
            x_val = 0.0
        try:
            y_val = float(y1)
        except (TypeError, ValueError):
            y_val = 0.0
        return x_val, y_val

    def choose_best_title_candidate(candidates):
        if not candidates:
            return ""
        bounded = [item for item in candidates if len(str(item.get("text") or "").strip()) <= 140]
        pool = bounded or candidates
        ranked = sorted(
            pool,
            key=lambda item: (
                int(item.get("priority") or 99),
                len(str(item.get("text") or "").strip()),
                get_rect_origin(item)[1],
                get_rect_origin(item)[0],
            ),
        )
        return str((ranked[0] or {}).get("text") or "").strip()

    markers = {
        "sectionName": "",
        "sectionTitle": "",
        "sectionCode": "",
        "trimester": "",
        "grade": "",
        "pageNumber": "",
        "skills": [],
        "footerRecortable": False,
    }
    template_kind = _resolve_template_kind(session)
    strict_mapping = _has_explicit_mapping(session)
    if strict_mapping:
        alias_values = _extract_alias_values(page, alias_index=alias_index, include_master=True)
        markers["sectionTitle"] = str(alias_values.get("titulo_seccion") or "").strip()
        markers["pageNumber"] = first_line(
            alias_values.get("folio_numero")
            or alias_values.get("folio_impar")
            or alias_values.get("folio_par")
        )
        markers["sectionCode"] = first_line(alias_values.get("folio_unidad"))
        markers["trimester"] = first_line(alias_values.get("folio_trimestre"))
        markers["grade"] = first_line(alias_values.get("folio_nivel"))
        markers["skills"] = unique_lines(
            alias_values.get("habilidad"),
            alias_values.get("habilidad_verso"),
            alias_values.get("habilidad_recto"),
            alias_values.get("habilidad_caracter"),
        )
        markers["footerRecortable"] = "recortable" in _normalize_story_text(alias_values.get("recortable_footer"))
        if "unidad_normal" in template_kind:
            composite_text = "\n".join(
                value for value in (
                    alias_values.get("pie_pagina"),
                    alias_values.get("pie_pagina_recto"),
                    alias_values.get("pie_pagina_verso"),
                )
                if str(value or "").strip()
            ).strip()
            composite = _parse_unit_normal_footer_text(
                composite_text,
                page_name=str(page.get("pageName") or "").strip(),
                gemini_verifier=gemini_verifier,
            ) if composite_text else {}
            if composite.get("sectionCode") and not markers["sectionCode"]:
                markers["sectionCode"] = composite["sectionCode"]
            if composite.get("trimester") and not markers["trimester"]:
                markers["trimester"] = composite["trimester"]
            if composite.get("grade") and not markers["grade"]:
                markers["grade"] = composite["grade"]
            if composite.get("sectionName"):
                markers["sectionName"] = composite["sectionName"]
        else:
            markers["sectionName"] = str(alias_values.get("nombre_seccion") or "").strip()
        return markers

    title_candidates = []
    for item in _iter_page_bucket_items(page, include_master=True):
        text = str(item.get("text") or "").strip()
        normalized_text = page.get("pageName") or "" if text == AUTO_PAGE_NUMBER_TOKEN else text
        if not normalized_text:
            continue
        style_name = str(item.get("styleName") or "").strip().upper()
        styles = [str(value or "").strip().upper() for value in (item.get("characterStyles") or []) if str(value or "").strip()]
        is_generic_footer_placeholder = normalized_text.lower().startswith("pie de página")
        if _has_alias_style(alias_index, "nombre_seccion", "paragraph", style_name) and not markers["sectionName"] and not is_generic_footer_placeholder:
            markers["sectionName"] = normalized_text
        if _matches_unit_normal_footer_style(alias_index=alias_index, style_name=style_name) and "unidad_normal" in template_kind:
            composite = _parse_unit_normal_footer_text(
                normalized_text,
                page_name=str(page.get("pageName") or "").strip(),
                gemini_verifier=gemini_verifier,
            )
            if composite.get("sectionCode") and not markers["sectionCode"]:
                markers["sectionCode"] = composite["sectionCode"]
            if composite.get("trimester") and not markers["trimester"]:
                markers["trimester"] = composite["trimester"]
            if composite.get("grade") and not markers["grade"]:
                markers["grade"] = composite["grade"]
            if composite.get("sectionName"):
                markers["sectionName"] = composite["sectionName"]
        elif not strict_mapping and (
            _has_alias_style(alias_index, "pie_pagina", "paragraph", style_name) or
            style_name == "01_05 TITULO SECCION Y COMPETENCIA"
        ) and not markers["sectionName"] and not is_generic_footer_placeholder:
            markers["sectionName"] = normalized_text
        if not strict_mapping and "PIE DE PAGINA" in style_name and "unidad_normal" in template_kind:
            composite = _parse_composite_footer_text(normalized_text)
            if composite.get("sectionCode") and not markers["sectionCode"]:
                markers["sectionCode"] = composite["sectionCode"]
            if composite.get("trimester") and not markers["trimester"]:
                markers["trimester"] = composite["trimester"]
            if composite.get("grade") and not markers["grade"]:
                markers["grade"] = composite["grade"]
            if composite.get("sectionName"):
                markers["sectionName"] = composite["sectionName"]
        if any(
            _has_alias_style(alias_index, "folio_unidad", "character", style) or
            (not strict_mapping and style == "Z_FOLIO_UNIDAD")
            for style in styles
        ) and not markers["sectionCode"]:
            markers["sectionCode"] = normalized_text
        title_priority = None
        if _has_alias_style(alias_index, "titulo_seccion", "paragraph", style_name):
            title_priority = 0 if strict_mapping else 2
        elif not strict_mapping and _has_alias_style(alias_index, "titulo_unidad", "paragraph", style_name):
            title_priority = 0
        elif not strict_mapping and (
            _has_alias_style(alias_index, "titulo_literaturas", "paragraph", style_name) or
            style_name == "01_00_TITULO LITERATURAS Y EJERCICIOS"
        ):
            title_priority = 1
        if title_priority is not None:
            title_candidates.append({
                "text": normalized_text,
                "priority": title_priority,
                "frameRect": item.get("frameRect") or None,
            })
        if any(
            _has_alias_style(alias_index, "folio_trimestre", "character", style) or
            (not strict_mapping and style == "Z_FOLIO_TIRMESTRE")
            for style in styles
        ) and not markers["trimester"]:
            markers["trimester"] = normalized_text
        if any(
            _has_alias_style(alias_index, "folio_nivel", "character", style) or
            (not strict_mapping and style == "Z_FOLIO_NIVEL")
            for style in styles
        ) and not markers["grade"]:
            markers["grade"] = normalized_text
        if (
            any(
                _has_alias_style(alias_index, "folio_numero", "character", style) or
                (not strict_mapping and style in {"Z_FOLIOS", "Z_FOLIOS RECORTABLES"})
                for style in styles
            ) or
            _has_alias_style(alias_index, "folio_impar", "paragraph", style_name) or
            _has_alias_style(alias_index, "folio_par", "paragraph", style_name)
        ) and not markers["pageNumber"]:
            markers["pageNumber"] = normalized_text
        if (
            _has_alias_style(alias_index, "habilidad", "paragraph", style_name) or
            _has_alias_style(alias_index, "habilidad_verso", "paragraph", style_name) or
            _has_alias_style(alias_index, "habilidad_recto", "paragraph", style_name) or
            (not strict_mapping and style_name == "08_05_02 HABILIDADES")
        ) and normalized_text and normalized_text not in markers["skills"] and normalized_text.upper() not in {"X", "XX", "XXX"}:
            markers["skills"].append(normalized_text)
        if (
            _has_alias_style(alias_index, "recortable_footer", "paragraph", style_name) or
            (not strict_mapping and style_name == "12_01 PIE DE PAGINA DERCHO")
        ) and "recortable" in _normalize_story_text(normalized_text):
            markers["footerRecortable"] = True
    if not strict_mapping and not markers["pageNumber"]:
        page_name = str(page.get("pageName") or "").strip()
        if page_name.isdigit():
            markers["pageNumber"] = page_name
    markers["sectionTitle"] = choose_best_title_candidate(title_candidates)
    return markers


def _resolve_master_display_name(master, fallback=""):
    if not master:
        return str(fallback or "").strip()
    return f"{master.get('namePrefix', '')}{master.get('baseName', '')}".strip() or str(fallback or "").strip()


def _find_base_master(master_spreads):
    for master in (master_spreads or {}).values():
        prefix = str(master.get("namePrefix") or "").strip().upper()
        base_name = str(master.get("baseName") or "").strip().upper()
        if prefix == "BASE" and base_name == "BASE":
            return master
    return None


def _extract_field_profiles(page, swatch_lookup, alias_index=None):
    profiles = []
    seen = set()
    for item in _iter_page_bucket_items(page, include_master=True):
        style_name = str(item.get("styleName") or "").strip().upper()
        if not (_has_alias_style(alias_index, "campo_formativo", "paragraph", style_name) or style_name == "01_04_CAMPO FORMATIVO"):
            continue
        text = _normalize_story_text(item.get("text"))
        if not text or text.endswith("xxx"):
            continue
        for field in FIELD_FORMATIVO_CATALOG:
            if field["match"] not in text or field["swatchName"] in seen:
                continue
            seen.add(field["swatchName"])
            swatch = swatch_lookup.get(field["swatchName"]) or {}
            profiles.append({
                "label": field["label"],
                "swatchName": field["swatchName"],
                "cmyk": swatch.get("cmyk") or "",
                "hex": swatch.get("hex") or "",
            })
            break
    return profiles


def _extract_configured_swatch_matches(page, swatch_lookup, swatch_entries=None):
    configured = []
    seen = set()
    used_swatches = {
        _normalize_style_name(name)
        for name in [
            *((page or {}).get("textSwatches") or []),
            *((page or {}).get("frameSwatches") or []),
        ]
        if _normalize_style_name(name)
    }
    if not used_swatches:
        return configured
    for entry in (swatch_entries or []):
        swatch_name = _normalize_style_name(entry.get("swatchName") or "")
        alias = str(entry.get("alias") or "").strip()
        if not swatch_name or swatch_name not in used_swatches:
            continue
        key = (alias, swatch_name)
        if key in seen:
            continue
        seen.add(key)
        swatch = swatch_lookup.get(swatch_name) or {}
        configured.append({
            "alias": alias,
            "swatchName": swatch_name,
            "cmyk": swatch.get("cmyk") or "",
            "hex": swatch.get("hex") or "",
            "inText": swatch_name in {_normalize_style_name(name) for name in ((page or {}).get("textSwatches") or [])},
            "inFrames": swatch_name in {_normalize_style_name(name) for name in ((page or {}).get("frameSwatches") or [])},
        })
    return configured


def _build_style_usage(stories, styles, key, label_key):
    lookup = _build_style_lookup(styles.get(label_key) or [])
    counter = Counter()
    for story in stories or []:
        for style_id in story.get(key) or []:
            clean = str(style_id or "").strip()
            if clean:
                counter[clean] += 1
    rows = []
    for style_id, uses in counter.most_common(10):
        rows.append({
            "styleId": style_id,
            "styleName": lookup.get(style_id) or style_id,
            "uses": uses,
        })
    return rows


def _build_story_preview(stories, limit=6):
    ranked = sorted(
        (entry for entry in (stories or []) if str((entry or {}).get("text") or "").strip()),
        key=lambda entry: len(str(entry.get("text") or "")),
        reverse=True,
    )
    preview = []
    for entry in ranked[:limit]:
        text = " ".join(str(entry.get("text") or "").split())
        preview.append({
            "storyId": entry.get("storyId") or "",
            "storyTitle": entry.get("storyTitle") or "",
            "length": len(text),
            "excerpt": text[:220],
        })
    return preview


def _group_story_refs_by_story(story_refs=None):
    grouped = {}
    ordered = []
    for story_ref in (story_refs or []):
        story_id = str((story_ref or {}).get("storyId") or "").strip()
        if not story_id:
            continue
        bucket = grouped.setdefault(story_id, [])
        if not bucket:
            ordered.append(story_id)
        bucket.append(story_ref)
    return ordered, grouped


def _pick_representative_story_ref(story_refs=None):
    refs = list(story_refs or [])
    if not refs:
        return {}

    def sort_key(story_ref):
        rect = (story_ref or {}).get("frameRect") or {}
        try:
            y1 = float(rect.get("y1"))
        except (TypeError, ValueError):
            y1 = 0.0
        try:
            x1 = float(rect.get("x1"))
        except (TypeError, ValueError):
            x1 = 0.0
        return (y1, x1, str((story_ref or {}).get("frameId") or "").strip())

    return sorted(refs, key=sort_key)[0]


def _build_story_page_sequences(pages=None):
    sequences = {}
    for page in sorted(pages or [], key=lambda entry: int(entry.get("pageSequence") or 0)):
        page_name = str(page.get("pageName") or "").strip()
        for story_ref in (page.get("storyRefs") or []):
            story_id = str((story_ref or {}).get("storyId") or "").strip()
            if not story_id or not page_name:
                continue
            bucket = sequences.setdefault(story_id, [])
            if page_name not in bucket:
                bucket.append(page_name)
    return sequences


def _frame_center_belongs_to_page(frame_rect=None, page_rect=None):
    if not frame_rect or not page_rect:
        return False
    try:
        center_x = (float(frame_rect.get("x1")) + float(frame_rect.get("x2"))) / 2.0
        center_y = (float(frame_rect.get("y1")) + float(frame_rect.get("y2"))) / 2.0
    except (TypeError, ValueError):
        return False
    return (
        float(page_rect.get("x1")) <= center_x <= float(page_rect.get("x2"))
        and float(page_rect.get("y1")) <= center_y <= float(page_rect.get("y2"))
    )


def _build_embedded_story_ref_lookup(stories=None):
    lookup = {}
    for story in (stories or []):
        for story_ref in (story.get("embeddedStoryRefs") or []):
            story_id = str((story_ref or {}).get("storyId") or "").strip()
            if not story_id:
                continue
            lookup.setdefault(story_id, []).append(story_ref)
    return lookup


def _resolve_story_ref_for_page(page=None, story=None, parent_story_ref=None, embedded_story_ref_lookup=None):
    page_rect = (page or {}).get("pageRect") or None
    story_id = str((story or {}).get("storyId") or "").strip()
    embedded_refs = list((embedded_story_ref_lookup or {}).get(story_id) or [])
    if embedded_refs:
        matching_refs = [
            story_ref
            for story_ref in embedded_refs
            if _frame_center_belongs_to_page((story_ref or {}).get("frameRect") or None, page_rect)
        ]
        if not matching_refs:
            return None
        selected = dict(matching_refs[0] or {})
        selected["textStatus"] = _classify_text_frame_status(
            selected.get("frameRect") or None,
            page_rect,
            bool(selected.get("overflows")),
        )
        return selected
    return parent_story_ref


def _iterate_story_with_embeds(story=None, stories_by_id=None, seen=None):
    current_story = story or {}
    story_id = str(current_story.get("storyId") or "").strip()
    if not story_id:
        return
    if seen is None:
        seen = set()
    if story_id in seen:
        return
    seen.add(story_id)
    yield current_story
    for embedded_story_id in (current_story.get("embeddedStoryIds") or []):
        child_story = (stories_by_id or {}).get(str(embedded_story_id or "").strip())
        if not child_story:
            continue
        yield from _iterate_story_with_embeds(child_story, stories_by_id=stories_by_id, seen=seen)


def _slice_story_blocks_for_page(story=None, page_name="", story_page_sequences=None):
    blocks = list((story or {}).get("paragraphBlocks") or [])
    if len(blocks) <= 1:
        return blocks
    story_id = str((story or {}).get("storyId") or "").strip()
    page_order = list((story_page_sequences or {}).get(story_id) or [])
    if len(page_order) <= 1:
        return blocks
    current_page = str(page_name or "").strip()
    if current_page not in page_order:
        return blocks
    page_index = page_order.index(current_page)
    trailing_page_count = max(0, len(page_order) - 1)
    reserved_tail = min(trailing_page_count, max(0, len(blocks) - 1))
    leading_count = max(1, len(blocks) - reserved_tail)
    if page_index == 0:
        return blocks[:leading_count]
    tail_index = page_index - 1
    start = leading_count + tail_index
    end = min(len(blocks), start + 1)
    return blocks[start:end]


def _build_page_reports(pages, stories, styles, alias_index=None):
    paragraph_lookup = _build_style_lookup(styles.get("paragraphStyles") or [])
    character_lookup = _build_style_lookup(styles.get("characterStyles") or [])
    paragraph_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("paragraphStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }
    character_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("characterStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }
    stories_by_id = {
        str((story or {}).get("storyId") or "").strip(): story
        for story in (stories or [])
        if str((story or {}).get("storyId") or "").strip()
    }
    embedded_story_ref_lookup = _build_embedded_story_ref_lookup(stories)
    story_page_sequences = _build_story_page_sequences(pages)
    reports = []
    for page in pages or []:
        grouped = {
            "títulos": [],
            "subtítulos": [],
            "instrucciones": [],
            "subinstrucciones": [],
            "párrafos normales": [],
            "otro": [],
        }
        master_grouped = {
            "títulos": [],
            "subtítulos": [],
            "instrucciones": [],
            "subinstrucciones": [],
            "párrafos normales": [],
            "otro": [],
        }
        paragraph_styles_used = []
        character_styles_used = []
        text_swatches = []
        story_order, story_ref_groups = _group_story_refs_by_story(page.get("storyRefs") or [])
        for story_id in story_order:
            story = stories_by_id.get(story_id)
            if not story:
                continue
            story_ref = _pick_representative_story_ref(story_ref_groups.get(story_id) or [])
            for resolved_story in _iterate_story_with_embeds(story, stories_by_id=stories_by_id):
                effective_story_ref = _resolve_story_ref_for_page(
                    page=page,
                    story=resolved_story,
                    parent_story_ref=story_ref,
                    embedded_story_ref_lookup=embedded_story_ref_lookup,
                )
                if not effective_story_ref:
                    continue
                for block in _slice_story_blocks_for_page(
                    resolved_story,
                    page_name=page.get("pageName") or "",
                    story_page_sequences=story_page_sequences,
                ):
                    temp_page = {
                        "pageName": page.get("pageName") or "",
                        "content": grouped,
                        "masterContent": master_grouped,
                        "paragraphStyles": paragraph_styles_used,
                        "characterStyles": character_styles_used,
                        "textSwatches": text_swatches,
                    }
                    _append_block_to_page(
                        temp_page,
                        resolved_story,
                        block,
                        effective_story_ref,
                        paragraph_lookup,
                        character_lookup,
                        paragraph_style_details,
                        character_style_details,
                        alias_index,
                        from_master=False,
                    )
        reports.append({
            "pageName": page.get("pageName") or "",
            "pageId": page.get("pageId") or "",
            "pageIndex": page.get("pageIndex") or 0,
            "pageSequence": page.get("pageSequence") or 0,
            "spreadId": page.get("spreadId") or "",
            "appliedMaster": page.get("appliedMaster") or "",
            "masterName": page.get("appliedMaster") or "",
            "pageRect": page.get("pageRect") or None,
            "pageItems": page.get("pageItems") or [],
            "storyRefs": page.get("storyRefs") or [],
            "storyCount": len(page.get("storyRefs") or []),
            "paragraphStyles": paragraph_styles_used,
            "characterStyles": character_styles_used,
            "textSwatches": text_swatches,
            "frameSwatches": page.get("frameSwatches") or [],
            "content": grouped,
            "masterContent": master_grouped,
            "aliasValues": {},
            "fieldProfiles": [],
            "notes": [],
            "noteHistory": [],
            "footerMarkers": {"sectionName": "", "sectionTitle": "", "sectionCode": "", "trimester": "", "grade": "", "pageNumber": "", "skills": []},
            "numbering": None,
            "spellingIssues": [],
            "orthotypographyIssues": [],
        })
    return reports


def _apply_master_content(page_reports, master_spreads, stories, styles, alias_index=None):
    if not master_spreads:
        return page_reports
    stories_by_id = {
        str((story or {}).get("storyId") or "").strip(): story
        for story in (stories or [])
        if str((story or {}).get("storyId") or "").strip()
    }
    embedded_story_ref_lookup = _build_embedded_story_ref_lookup(stories)
    paragraph_lookup = _build_style_lookup(styles.get("paragraphStyles") or [])
    character_lookup = _build_style_lookup(styles.get("characterStyles") or [])
    paragraph_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("paragraphStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }
    character_style_details = {
        str((entry or {}).get("self") or "").strip(): entry
        for entry in (styles.get("characterStyles") or [])
        if str((entry or {}).get("self") or "").strip()
    }

    def apply_single_master(page, master):
        if not master or not master.get("showMasterItems"):
            return
        page_index = int(page.get("pageIndex") or 0)
        master_pages = master.get("pages") or []
        if not master_pages:
            return
        target_master_page = master_pages[min(page_index, len(master_pages) - 1)]
        story_order, story_ref_groups = _group_story_refs_by_story(target_master_page.get("storyRefs") or [])
        for story_id in story_order:
            story = stories_by_id.get(story_id)
            if not story:
                continue
            story_ref = _pick_representative_story_ref(story_ref_groups.get(story_id) or [])
            for resolved_story in _iterate_story_with_embeds(story, stories_by_id=stories_by_id):
                effective_story_ref = _resolve_story_ref_for_page(
                    page=page,
                    story=resolved_story,
                    parent_story_ref=story_ref,
                    embedded_story_ref_lookup=embedded_story_ref_lookup,
                )
                if not effective_story_ref:
                    continue
                for block in resolved_story.get("paragraphBlocks") or []:
                    _append_block_to_page(
                        page,
                        resolved_story,
                        block,
                        effective_story_ref,
                        paragraph_lookup,
                        character_lookup,
                        paragraph_style_details,
                        character_style_details,
                        alias_index,
                        from_master=True,
                    )
        for swatch_name in target_master_page.get("frameSwatches") or []:
            if swatch_name and swatch_name not in page["frameSwatches"]:
                page["frameSwatches"].append(swatch_name)

    def apply_master_chain(page, master_id, seen=None):
        clean_master_id = str(master_id or "").strip()
        if not clean_master_id:
            return
        if seen is None:
            seen = set()
        if clean_master_id in seen:
            return
        seen.add(clean_master_id)
        master = master_spreads.get(clean_master_id)
        if not master:
            return
        page_index = int(page.get("pageIndex") or 0)
        master_pages = master.get("pages") or []
        target_master_page = master_pages[min(page_index, len(master_pages) - 1)] if master_pages else {}
        inherited_master_id = str((target_master_page or {}).get("appliedMaster") or "").strip()
        if inherited_master_id and inherited_master_id != "n":
            apply_master_chain(page, inherited_master_id, seen)
        apply_single_master(page, master)

    base_master = _find_base_master(master_spreads)
    for page in page_reports or []:
        if base_master:
            apply_single_master(page, base_master)
        master_id = str(page.get("appliedMaster") or "").strip()
        apply_master_chain(page, master_id)
        master = master_spreads.get(master_id)
        page["masterName"] = _resolve_master_display_name(master, master_id)
        page["aliasValues"] = _extract_alias_values(page, alias_index=alias_index, include_master=True)
        page["footerMarkers"] = _extract_footer_markers(page, alias_index=alias_index, session=None, gemini_verifier=None)
    return page_reports


def _build_semantic_blocks(page_reports):
    blocks = []
    for page in page_reports or []:
        for block_type, entries in (page.get("content") or {}).items():
            for entry in entries or []:
                blocks.append({
                    "pageName": page.get("pageName") or "",
                    "storyId": entry.get("storyId") or "",
                    "storyTitle": entry.get("storyTitle") or "",
                    "storySource": "",
                    "blockType": block_type,
                    "styleName": entry.get("styleName") or "",
                    "text": entry.get("text") or "",
                })
    return blocks


def _attach_page_notes(page_reports, stories):
    stories_by_id = {
        str((story or {}).get("storyId") or "").strip(): story
        for story in (stories or [])
        if str((story or {}).get("storyId") or "").strip()
    }
    global_active_notes = []
    global_note_history = []
    for page in page_reports or []:
        page_notes = []
        page_note_history = []
        seen = set()
        for story_ref in (page.get("storyRefs") or []):
            story_id = str((story_ref or {}).get("storyId") or "").strip()
            if not story_id:
                continue
            story = stories_by_id.get(story_id) or {}
            note_buckets = story.get("notes") or {}
            for bucket_name, page_target, global_target, prefix in (
                ("active", page_notes, global_active_notes, "nota activa"),
                ("history", page_note_history, global_note_history, "historial de nota"),
            ):
                for note in (note_buckets.get(bucket_name) or []):
                    note_text = " ".join(str((note or {}).get("text") or "").split()).strip()
                    if not note_text:
                        continue
                    signature = (bucket_name, story_id, note_text.lower())
                    if signature in seen:
                        continue
                    seen.add(signature)
                    record = {
                        "pageName": page.get("pageName") or "",
                        "storyId": story_id,
                        "storyTitle": story.get("storyTitle") or "",
                        "text": note_text,
                        "userName": str((note or {}).get("userName") or "").strip(),
                        "creationDate": str((note or {}).get("creationDate") or "").strip(),
                        "modificationDate": str((note or {}).get("modificationDate") or "").strip(),
                        "collapsed": bool((note or {}).get("collapsed")),
                        "changeType": str((note or {}).get("changeType") or "").strip(),
                    }
                    page_target.append(record)
                    global_target.append({
                        "pageName": record["pageName"],
                        "storyId": record["storyId"],
                        "message": f"Página {record['pageName'] or '?'}: {prefix} - {record['text']}",
                        "text": record["text"],
                        "userName": record["userName"],
                        "changeType": record["changeType"],
                    })
        page["notes"] = page_notes
        page["noteHistory"] = page_note_history
    return global_active_notes, global_note_history, page_reports


def _attach_page_level_findings(page_reports, pagination_rows, spelling_issues, orthotypography_issues):
    numbering_by_page = {
        str((row or {}).get("pageName") or "").strip(): row
        for row in (pagination_rows or [])
        if str((row or {}).get("pageName") or "").strip()
    }
    spelling_by_page = {}
    orthotypography_by_page = {}
    for issue in spelling_issues or []:
        spelling_by_page.setdefault(str(issue.get("pageName") or "").strip(), []).append(issue)
    for issue in orthotypography_issues or []:
        orthotypography_by_page.setdefault(str(issue.get("pageName") or "").strip(), []).append(issue)
    for page in page_reports or []:
        page_name = str(page.get("pageName") or "").strip()
        page["numbering"] = numbering_by_page.get(page_name) or {
            "pageName": page_name,
            "ok": False,
            "message": f"La página {page_name or '?'} no tiene dato de numeración.",
        }
        page["spellingIssues"] = spelling_by_page.get(page_name, [])
        page["orthotypographyIssues"] = orthotypography_by_page.get(page_name, [])
        folio = str(((page.get("footerMarkers") or {}).get("pageNumber")) or "").strip()
        if folio:
            page["numbering"]["visiblePageNumber"] = folio
    return page_reports


def _extract_linked_asset_mentions(text, allowed_types=None):
    import re

    source = str(text or "").strip()
    if not source:
        return []
    allowed = {
        str(value or "").strip().lower()
        for value in (allowed_types or [entry[0] for entry in LINKED_ASSET_TYPES])
        if str(value or "").strip()
    }
    code_allowed = [entry for entry in LINKED_ASSET_TYPES if entry[0] in allowed and entry[0] != "video"]
    type_pattern = "|".join(re.escape(entry[1]) for entry in code_allowed)
    seen = set()
    mentions = []
    if "video" in allowed:
        for title in _extract_video_titles(source):
            key = f"video:{title.lower()}"
            if key in seen:
                continue
            seen.add(key)
            mentions.append({
                "kind": "video",
                "code": title,
                "label": title,
            })
    if not type_pattern:
        return mentions
    matches = re.findall(rf"\b({type_pattern})s?\s+([A-Za-z0-9]+)\b", source, flags=re.IGNORECASE)
    for raw_type, raw_code in matches:
        kind = str(raw_type or "").strip().lower()
        code = str(raw_code or "").strip()
        key = f"{kind}:{code.lower()}"
        if kind and code and key not in seen:
            seen.add(key)
            label_prefix = next((entry[2] for entry in LINKED_ASSET_TYPES if entry[0] == kind), kind.title())
            mentions.append({
                "kind": kind,
                "code": code,
                "label": f"{label_prefix} {code}",
            })
    return mentions


def _extract_recortable_codes(text):
    return [entry["code"] for entry in _extract_linked_asset_mentions(text, allowed_types=["recortable"])]


def _extract_recortable_fallback_codes(text):
    import re

    source = str(text or "").strip()
    if not source:
        return []
    matches = re.findall(r"\b(?:[A-Za-z]{1,3}T\d+|\d+[A-Za-z])\b", source, flags=re.IGNORECASE)
    seen = set()
    codes = []
    for match in matches:
        clean = str(match or "").strip()
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            codes.append(clean)
    return codes


def _extract_visual_recortable_codes(text):
    import re

    source = str(text or "").strip()
    if not source:
        return []
    matches = re.findall(r"\b(?:\d+[A-Za-z]T\d+|[A-Za-z]\d+T\d+)\b", source, flags=re.IGNORECASE)
    seen = set()
    codes = []
    for match in matches:
        clean = str(match or "").strip()
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            codes.append(clean)
    return codes


def _normalize_visual_code(code=""):
    import re

    raw = str(code or "").strip()
    if not raw:
        return ""
    match = re.search(r"\b(?:\d+[A-Za-z]T\d+|[A-Za-z]\d+T\d+)\b", raw, flags=re.IGNORECASE)
    return str(match.group(0)).strip() if match else ""


def _extract_video_titles(text):
    import re

    source = str(text or "").strip()
    if not source:
        return []
    patterns = [
        r"\bvideo\b\s*[\"“”'']([^\"“”'']{3,140})[\"“”'']",
        r"\bvideo\b\s+«([^»]{3,140})»",
    ]
    seen = set()
    titles = []
    for pattern in patterns:
        for match in re.findall(pattern, source, flags=re.IGNORECASE):
            clean = " ".join(str(match or "").split()).strip(" .,:;")
            key = clean.lower()
            if clean and key not in seen:
                seen.add(key)
                titles.append(clean)
    return titles


def _normalize_visual_reference(kind="", code="", title="", fallback_text=""):
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind == "video":
        title_candidates = []
        raw_title = " ".join(str(title or "").split()).strip(" .,:;")
        if raw_title:
            title_candidates.append(raw_title)
        title_candidates.extend(_extract_video_titles(fallback_text))
        seen = set()
        titles = []
        for candidate in title_candidates:
            key = candidate.lower()
            if candidate and key not in seen:
                seen.add(key)
                titles.append(candidate)
        return titles
    normalized_code = _normalize_visual_code(code)
    if normalized_code:
        return [normalized_code]
    return _extract_visual_recortable_codes(fallback_text)


def _extract_story_inline_asset_detections(story=None):
    import re

    tokens = list((story or {}).get("flowTokens") or [])
    if not tokens:
        return []
    detections = []
    code_pattern = re.compile(r"\b(?:\d+[A-Za-z]T\d+|[A-Za-z]\d+T\d+)\b", flags=re.IGNORECASE)
    for index, token in enumerate(tokens):
        if token.get("type") != "text":
            continue
        text = str(token.get("text") or "")
        for match in code_pattern.finditer(text):
            code = str(match.group(0) or "").strip()
            if not code:
                continue
            icon_kind = ""
            icon_distance_ok = False
            for lookback in range(index - 1, max(-1, index - 4), -1):
                previous = tokens[lookback]
                if previous.get("type") == "icon":
                    icon_kind = str(previous.get("iconKind") or "").strip().lower()
                    icon_distance_ok = match.start() <= 24
                    break
                previous_text = str(previous.get("text") or "")
                if previous_text and previous_text.strip() and len(previous_text.strip()) > 3:
                    break
            if icon_kind and icon_distance_ok:
                detections.append({
                    "kind": icon_kind,
                    "codes": [code],
                    "reason": "story-inline-icon",
                })
    return _dedupe_visual_detections(detections)


def _dedupe_visual_detections(detections=None):
    seen = set()
    deduped = []
    for item in detections or []:
      kind = str((item or {}).get("kind") or "").strip().lower()
      codes = [str(value or "").strip() for value in ((item or {}).get("codes") or []) if str(value or "").strip()]
      reason = str((item or {}).get("reason") or "").strip()
      if not kind or not codes:
          continue
      unique_codes = []
      local_seen = set()
      for code in codes:
          code_key = code.lower()
          if code_key in local_seen:
              continue
          local_seen.add(code_key)
          unique_codes.append(code)
      if not unique_codes:
          continue
      key = f"{kind}:{'|'.join(code.lower() for code in unique_codes)}"
      if key in seen:
          continue
      seen.add(key)
      deduped.append({
          "kind": kind,
          "codes": unique_codes,
          "reason": reason,
      })
    return deduped


def _crop_story_preview(preview=None, page_rect=None, frame_rect=None):
    preview = preview or {}
    image_base64 = str(preview.get("base64") or "").strip()
    if not image_base64 or not page_rect or not frame_rect:
        return {}
    try:
        image_bytes = base64.b64decode(image_base64)
        with Image.open(io.BytesIO(image_bytes)) as image:
            width, height = image.size
            page_x1 = float(page_rect.get("x1"))
            page_y1 = float(page_rect.get("y1"))
            page_x2 = float(page_rect.get("x2"))
            page_y2 = float(page_rect.get("y2"))
            frame_x1 = float(frame_rect.get("x1"))
            frame_y1 = float(frame_rect.get("y1"))
            frame_x2 = float(frame_rect.get("x2"))
            frame_y2 = float(frame_rect.get("y2"))
            page_w = max(1.0, page_x2 - page_x1)
            page_h = max(1.0, page_y2 - page_y1)
            crop_x1 = max(page_x1, frame_x1 - (page_w * 0.015))
            crop_x2 = min(page_x2, frame_x2 + (page_w * 0.015))
            crop_y1 = max(page_y1, frame_y1 - (page_h * 0.015))
            frame_h = max(1.0, frame_y2 - frame_y1)
            crop_y2 = min(page_y2, frame_y1 + min(frame_h, page_h * 0.22))

            left = int(max(0, min(width - 1, ((crop_x1 - page_x1) / page_w) * width)))
            top = int(max(0, min(height - 1, ((crop_y1 - page_y1) / page_h) * height)))
            right = int(max(left + 1, min(width, ((crop_x2 - page_x1) / page_w) * width)))
            bottom = int(max(top + 1, min(height, ((crop_y2 - page_y1) / page_h) * height)))

            cropped = image.crop((left, top, right, bottom))
            buffer = io.BytesIO()
            cropped.save(buffer, format="PNG")
            return {
                "mimeType": "image/png",
                "base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
            }
    except Exception:
        return {}


def _is_first_grade_session(session=None):
    grade = str((((session or {}).get("bibliographicInfo")) or {}).get("grado") or "").strip().lower()
    return grade == "primero"


def _normalize_unidad(value=""):
    return str(value or "").strip().lower()


def _resolve_template_kind(session=None):
    unidad = _normalize_unidad((((session or {}).get("bibliographicInfo")) or {}).get("unidad") or "")
    is_first_grade = _is_first_grade_session(session)
    if unidad == "proyecto":
        return "primero_proyecto" if is_first_grade else "proyecto"
    if unidad == "unidad normal":
        return "primero_unidad_normal" if is_first_grade else "unidad_normal"
    if unidad == "recortables":
        return "recortables"
    if unidad == "fichas":
        return "fichas"
    if unidad == "anexos":
        return "anexos"
    return "primero_otro" if is_first_grade else "otro"


def _parse_composite_footer_text(text=""):
    import re

    raw = " ".join(str(text or "").replace("\u2003", " | ").split())
    if not raw:
        return {}
    segments = [segment.strip(" |") for segment in re.split(r"\s*\|\s*", raw) if segment.strip(" |")]
    if len(segments) < 2:
        return {}
    parsed = {}
    remainder = []
    for segment in segments:
        lower = segment.lower()
        if lower.startswith("unidad "):
            parsed["sectionCode"] = segment
        elif lower.startswith("trimestre "):
            parsed["trimester"] = segment
        elif lower.startswith("nivel "):
            parsed["grade"] = segment
        else:
            remainder.append(segment)
    if remainder:
        parsed["sectionName"] = " · ".join(remainder)
    return parsed


def _parse_unit_normal_footer_text(text="", page_name="", gemini_verifier=None):
    fallback = _parse_composite_footer_text(text)
    verifier = gemini_verifier if isinstance(gemini_verifier, GeminiVerifier) else None
    if verifier:
        parsed = verifier.parse_unit_footer_text(
            page_name=str(page_name or "").strip(),
            footer_text=text,
        )
        if isinstance(parsed, dict):
            merged = dict(fallback)
            for key in ("sectionCode", "grade", "trimester", "sectionName"):
                value = str(parsed.get(key) or "").strip()
                if value:
                    merged[key] = value
            return merged
    return fallback


def _build_external_asset_destination_index(session=None):
    destination_index = {}
    for revision in ((session or {}).get("revisions") or []):
        unidad = _normalize_unidad((revision or {}).get("unidad") or "")
        linked_kind = ""
        if unidad == "recortables":
            linked_kind = "recortable"
        elif unidad == "fichas":
            linked_kind = "ficha"
        elif unidad == "anexos":
            linked_kind = "anexo"
        if not linked_kind:
            continue
        linked_file_label = str((revision or {}).get("title") or unidad.title()).strip() or unidad.title()
        for file_entry in ((revision or {}).get("files") or []):
            result = (file_entry or {}).get("result") or {}
            stats = result.get("stats") or {}
            for page in (stats.get("pageReports") or []):
                page_name = str((page or {}).get("pageName") or "").strip()
                if not page_name:
                    continue
                text_fragments = []
                footer_title = str((((page or {}).get("footerMarkers") or {}).get("sectionTitle")) or "").strip()
                if footer_title:
                    text_fragments.append(footer_title)
                for item in _iter_page_bucket_items(page, include_master=True):
                    text = str((item or {}).get("text") or "").strip()
                    if text:
                        text_fragments.append(text)
                aggregated = " ".join(text_fragments)
                for mention in _extract_linked_asset_mentions(aggregated, allowed_types=[linked_kind]):
                    key = f"{linked_kind}:{mention['code'].lower()}"
                    destination_index.setdefault(key, []).append({
                        "kind": linked_kind,
                        "code": mention["code"],
                        "label": mention["label"],
                        "pageName": page_name,
                        "fileTitle": str((file_entry or {}).get("documentName") or linked_file_label).strip() or linked_file_label,
                        "revisionTitle": linked_file_label,
                    })
    return destination_index


def _page_has_instructional_content(page):
    for bucket_name in ("instrucciones", "subinstrucciones"):
        if (page.get("content") or {}).get(bucket_name):
            return True
    return False


def _classify_visual_linked_asset_kind(page):
    items = page.get("pageItems") or []
    page_rect = page.get("pageRect") or {}
    try:
        x1 = float(page_rect.get("x1"))
        x2 = float(page_rect.get("x2"))
        y1 = float(page_rect.get("y1"))
        y2 = float(page_rect.get("y2"))
    except (TypeError, ValueError):
        return ""
    page_width = max(1.0, x2 - x1)
    page_height = max(1.0, y2 - y1)
    outer_edge = "left" if abs(x1) > abs(x2) else "right"
    edge_margin = max(72.0, page_width * 0.12)
    top_limit = y1 + (page_height * 0.34)

    def is_outer_edge_item(rect):
        if not rect:
            return False
        if outer_edge == "left":
            return float(rect.get("x1", 10**9)) <= (x1 + edge_margin)
        return float(rect.get("x2", -10**9)) >= (x2 - edge_margin)

    has_edge_inline_icon = False
    has_edge_panel_marker = False
    has_edge_video_marker = False
    for item in items:
        style_name = _normalize_object_style_name(item.get("appliedObjectStyle") or "")
        rect = item.get("frameRect") or {}
        center_y = (float(rect.get("y1", 0)) + float(rect.get("y2", 0))) / 2 if rect else 0
        if center_y > top_limit:
            continue
        if "ICONOS INLINE" in style_name and is_outer_edge_item(rect):
            has_edge_inline_icon = True
        if "PERSIANA TABLERO" in style_name and is_outer_edge_item(rect):
            has_edge_panel_marker = True
        if "VIDEO" in style_name and is_outer_edge_item(rect):
            has_edge_video_marker = True
        if "CUTOUTS LINE" in style_name:
            has_edge_panel_marker = True
    if has_edge_video_marker:
        return "video"
    if has_edge_panel_marker and _page_has_instructional_content(page):
        return "recortable"
    if has_edge_inline_icon:
        return "anexo"
    return ""


def _detect_visual_linked_asset_with_gemini(page, session=None, gemini_verifier=None, story_preview_index=None):
    if not gemini_verifier or not gemini_verifier.enabled or not _is_first_grade_session(session):
        return {}
    candidates = []
    for bucket_name in ("instrucciones", "subinstrucciones"):
        for item in ((page.get("content") or {}).get(bucket_name) or []):
            story_id = str(item.get("storyId") or "").strip()
            candidates.append({
                "storyId": story_id,
                "text": str(item.get("text") or "").strip(),
                "story": (story_preview_index or {}).get(story_id) or {},
                "frameRect": item.get("frameRect") or None,
            })
    for candidate in candidates:
        story = candidate.get("story") or {}
        inline_detections = _extract_story_inline_asset_detections(story)
        if inline_detections:
            return {"detections": inline_detections}
        preview = (story.get("previewImage") or {}) if isinstance(story, dict) else {}
        if not preview.get("base64"):
            continue
        cropped_preview = _crop_story_preview(
            preview,
            page.get("pageRect") or None,
            candidate.get("frameRect") or None,
        ) or preview or {}
        result = gemini_verifier.classify_linked_asset_visual(
            page_name=page.get("pageName") or "",
            image_base64=cropped_preview.get("base64") or "",
            mime_type=cropped_preview.get("mimeType") or "image/jpeg",
        )
        detections = []
        for asset in (result.get("assets") or []):
            kind = str((asset or {}).get("kind") or "").strip().lower()
            if not kind or kind == "unknown" or kind not in FIRST_GRADE_GEMINI_VISUAL_KINDS:
                continue
            references = _normalize_visual_reference(
                kind=kind,
                code=(asset or {}).get("code") or "",
                title=(asset or {}).get("title") or "",
                fallback_text=candidate.get("text") or "",
            )
            if not references:
                continue
            detections.append({
                "kind": kind,
                "codes": references,
                "reason": str((asset or {}).get("reason") or "").strip(),
            })
        detections = _dedupe_visual_detections(detections)
        if detections:
            return {"detections": detections}
    return {}


def _build_recortable_checks(page_reports, alias_index=None, session=None, gemini_verifier=None, story_preview_index=None):
    code_index = {}
    global_issues = []
    ignored_styles = {
        "08_05_02 HABILIDADES",
    }
    current_unidad = _normalize_unidad((((session or {}).get("bibliographicInfo")) or {}).get("unidad") or "")
    external_destination_index = _build_external_asset_destination_index(session)
    pages_by_name = {
        str((page or {}).get("pageName") or "").strip(): page
        for page in (page_reports or [])
        if str((page or {}).get("pageName") or "").strip()
    }

    for page in page_reports or []:
        page["recortableIssues"] = []
        page["recortableSummary"] = {
            "originIndicator": False,
            "visualIndicator": False,
            "visualKind": "",
            "codes": [],
            "originCodes": [],
            "destinationCodes": [],
            "resolvedDestinations": [],
            "resolvedLinks": [],
            "hasError": False,
        }

        page_codes = []
        origin_indicator = False
        destination_codes = []
        page_text_fragments = []
        destination_text_fragments = []
        page_mentions = []
        for item in _iter_page_bucket_items(page, include_master=False):
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            style_name = str(item.get("styleName") or "").strip().upper()
            if style_name in ignored_styles:
                continue
            page_text_fragments.append(text)
            if (_has_alias_style(alias_index, "recortable_indicator", "paragraph", style_name) or style_name == "08_01_COMPETENCIA") and "recortable" in _normalize_story_text(text):
                origin_indicator = True
            if (_has_alias_style(alias_index, "recortable_destination", "paragraph", style_name) or style_name == "01_00_TITULO LITERATURAS Y EJERCICIOS"):
                destination_text_fragments.append(text)
            mentions = _extract_linked_asset_mentions(text)
            for mention in mentions:
                page_mentions.append(mention)
                page_label = mention["label"]
                if page_label.lower() not in {value.lower() for value in page_codes}:
                    page_codes.append(page_label)
                entry_key = f"{mention['kind']}:{mention['code'].lower()}"
                entry = code_index.setdefault(entry_key, {
                    "kind": mention["kind"],
                    "code": mention["code"],
                    "label": mention["label"],
                    "origins": set(),
                    "destinations": set(),
                    "externalDestinations": [],
                    "destinationHasFooter": {},
                })
                if (_has_alias_style(alias_index, "recortable_destination", "paragraph", style_name) or style_name == "01_00_TITULO LITERATURAS Y EJERCICIOS"):
                    destination_codes.append(page_label)
                    entry["destinations"].add(str(page.get("pageName") or "").strip())
                    entry["destinationHasFooter"][str(page.get("pageName") or "").strip()] = bool((page.get("footerMarkers") or {}).get("footerRecortable"))

        aggregated_page_text = " ".join(page_text_fragments)
        aggregated_destination_text = " ".join(destination_text_fragments)
        visual_origin_codes = []
        textual_origin_indicator = origin_indicator
        for mention in _extract_linked_asset_mentions(aggregated_page_text):
            if mention["label"].lower() not in {value.lower() for value in page_codes}:
                page_codes.append(mention["label"])
        for mention in _extract_linked_asset_mentions(aggregated_destination_text):
            if mention["label"].lower() not in {value.lower() for value in destination_codes}:
                destination_codes.append(mention["label"])
            entry_key = f"{mention['kind']}:{mention['code'].lower()}"
            entry = code_index.setdefault(entry_key, {
                "kind": mention["kind"],
                "code": mention["code"],
                "label": mention["label"],
                "origins": set(),
                "destinations": set(),
                "externalDestinations": [],
                "destinationHasFooter": {},
            })
            entry["destinations"].add(str(page.get("pageName") or "").strip())
            entry["destinationHasFooter"][str(page.get("pageName") or "").strip()] = bool((page.get("footerMarkers") or {}).get("footerRecortable"))

        visual_detection = {}
        visual_detections = []
        if not origin_indicator:
            visual_detection = _detect_visual_linked_asset_with_gemini(
                page,
                session=session,
                gemini_verifier=gemini_verifier,
                story_preview_index=story_preview_index,
            )
            visual_detections = _dedupe_visual_detections(visual_detection.get("detections") or [])
            if not visual_detections:
                visual_kind = str(visual_detection.get("kind") or "").strip().lower()
            else:
                visual_kind = ""
            if not visual_kind and not visual_detections:
                visual_kind = _classify_visual_linked_asset_kind(page)
                if _is_first_grade_session(session) and visual_kind not in FIRST_GRADE_GEMINI_VISUAL_KINDS:
                    visual_kind = ""
                if visual_kind:
                    visual_detections = _dedupe_visual_detections([{
                        "kind": visual_kind,
                        "codes": _normalize_visual_reference(
                            kind=visual_kind,
                            fallback_text=aggregated_page_text,
                        ),
                    }])
        if not origin_indicator and visual_detections:
            visual_origin_codes = [
                str(value or "").strip()
                for detection in visual_detections
                for value in (detection.get("codes") or [])
                if str(value or "").strip()
            ]
            if visual_origin_codes:
                origin_indicator = True
                page["recortableSummary"]["visualIndicator"] = True
                page["recortableSummary"]["originIndicator"] = True
                visual_kinds = sorted({str((item or {}).get("kind") or "").strip().lower() for item in visual_detections if str((item or {}).get("kind") or "").strip()})
                page["recortableSummary"]["visualKind"] = ", ".join(visual_kinds)
                for detection in visual_detections:
                    visual_kind = str(detection.get("kind") or "recortable").strip().lower() or "recortable"
                    label_prefix = next((entry[2] for entry in LINKED_ASSET_TYPES if entry[0] == visual_kind), visual_kind.title())
                    for code in [str(value or "").strip() for value in (detection.get("codes") or []) if str(value or "").strip()]:
                        label = code if visual_kind == "video" else f"{label_prefix} {code}"
                        if label.lower() not in {value.lower() for value in page_codes}:
                            page_codes.append(label)
                        entry_key = f"{visual_kind}:{code.lower()}"
                        entry = code_index.setdefault(entry_key, {
                            "kind": visual_kind,
                            "code": code,
                            "label": label,
                            "origins": set(),
                            "destinations": set(),
                            "externalDestinations": [],
                            "destinationHasFooter": {},
                        })
                        entry["origins"].add(str(page.get("pageName") or "").strip())

        explicit_mentions = _extract_linked_asset_mentions(aggregated_page_text)
        if explicit_mentions:
            for mention in explicit_mentions:
                entry_key = f"{mention['kind']}:{mention['code'].lower()}"
                entry = code_index.setdefault(entry_key, {
                    "kind": mention["kind"],
                    "code": mention["code"],
                    "label": mention["label"],
                    "origins": set(),
                    "destinations": set(),
                    "externalDestinations": [],
                    "destinationHasFooter": {},
                })
                entry["origins"].add(str(page.get("pageName") or "").strip())
        if textual_origin_indicator:
            page["recortableSummary"]["originIndicator"] = True
            fallback_codes = _extract_recortable_fallback_codes(aggregated_page_text)
            for code in fallback_codes:
                label = f"Recortable {code}"
                if label.lower() not in {value.lower() for value in page_codes}:
                    page_codes.append(label)
                entry_key = f"recortable:{code.lower()}"
                entry = code_index.setdefault(entry_key, {
                    "kind": "recortable",
                    "code": code,
                    "label": label,
                    "origins": set(),
                    "destinations": set(),
                    "externalDestinations": [],
                    "destinationHasFooter": {},
                })
                entry["origins"].add(str(page.get("pageName") or "").strip())
            if not page_codes and current_unidad == "proyecto":
                page["recortableIssues"].append({
                    "pageName": page.get("pageName") or "",
                    "message": f'Página {page.get("pageName") or "?"}: el bloque de recortable mapeado no tiene referencia completa dentro del texto.',
                    "severity": "error",
                })

        page["recortableSummary"]["codes"] = page_codes
        page["recortableSummary"]["originCodes"] = page_codes if (origin_indicator or explicit_mentions) else []
        page["recortableSummary"]["destinationCodes"] = destination_codes

    for key, entry in code_index.items():
        code = entry["code"]
        kind = entry.get("kind") or "recortable"
        label = entry.get("label") or (code if kind == "video" else f"{kind.title()} {code}")
        pretty_kind = next((item[2] for item in LINKED_ASSET_TYPES if item[0] == kind), kind.title())
        origins = sorted(page for page in entry["origins"] if page)
        destinations = sorted(page for page in entry["destinations"] if page)
        external_destinations = entry.get("externalDestinations") or external_destination_index.get(key) or []
        if not destinations and external_destinations:
            if len(external_destinations) == 1:
                target = external_destinations[0]
                subject = label if kind == "video" else f"{pretty_kind} {code}"
                message = f"{subject}. Origen: pág. {', pág. '.join(origins)}. Destino: {target.get('fileTitle') or pretty_kind} · pág. {target.get('pageName') or '?'}."
                global_issues.append({
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": True,
                    "origins": origins,
                    "destination": target.get("pageName") or "",
                    "message": message,
                })
                for page_name in origins:
                    page = pages_by_name.get(page_name)
                    if page:
                        page["recortableSummary"]["resolvedDestinations"].append({
                            "code": label,
                            "destination": f"{target.get('fileTitle') or pretty_kind} · pág. {target.get('pageName') or '?'}",
                        })
                        page["recortableSummary"]["resolvedLinks"].append({
                            "code": label,
                            "role": "origin",
                            "origins": origins,
                            "destination": f"{target.get('fileTitle') or pretty_kind} · pág. {target.get('pageName') or '?'}",
                        })
                continue
            if len(external_destinations) > 1:
                issue = {
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": False,
                    "origins": origins,
                    "message": f"{pretty_kind} {code}: tiene múltiples páginas destino en archivos externos.",
                }
                global_issues.append(issue)
                for page_name in origins:
                    page = pages_by_name.get(page_name)
                    if page:
                        page["recortableIssues"].append({
                            "pageName": page_name,
                            "code": label,
                            "message": issue["message"],
                            "severity": "error",
                        })
                continue
        if origins and len(destinations) == 1:
            destination = destinations[0]
            has_footer = bool(entry["destinationHasFooter"].get(destination))
            if kind != "recortable" or has_footer:
                subject = label if kind == "video" else f"{pretty_kind} {code}"
                global_issues.append({
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": True,
                    "origins": origins,
                    "destination": destination,
                    "message": f"{subject}. Origen: pág. {', pág. '.join(origins)}. Destino: pág. {destination}.",
                })
                for page_name in origins:
                    page = pages_by_name.get(page_name)
                    if page:
                        page["recortableSummary"]["resolvedDestinations"].append({
                            "code": label,
                            "destination": destination,
                        })
                        page["recortableSummary"]["resolvedLinks"].append({
                            "code": label,
                            "role": "origin",
                            "origins": origins,
                            "destination": destination,
                        })
                destination_page = pages_by_name.get(destination)
                if destination_page:
                    destination_page["recortableSummary"]["resolvedDestinations"].append({
                        "code": label,
                        "destination": destination,
                    })
                    destination_page["recortableSummary"]["resolvedLinks"].append({
                        "code": label,
                        "role": "destination",
                        "origins": origins,
                        "destination": destination,
                    })
                continue

        if origins and not destinations:
            if current_unidad not in {"proyecto", "recortables", "fichas", "anexos"}:
                continue
            subject = label if kind == "video" else f"{pretty_kind} {code}"
            issue = {
                "code": code,
                "label": label,
                "kind": kind,
                "ok": False,
                "origins": origins,
                "destination": "",
                "message": f"{subject}: se detectó en origen (pág. {', pág. '.join(origins)}) pero no tiene página destino disponible.",
            }
            global_issues.append(issue)
            for page_name in origins:
                page = pages_by_name.get(page_name)
                if page:
                    page["recortableIssues"].append({
                        "pageName": page_name,
                        "code": label,
                        "message": issue["message"],
                        "severity": "error",
                    })
            continue

        if len(destinations) > 1:
            subject = label if kind == "video" else f"{pretty_kind} {code}"
            issue = {
                "code": code,
                "label": label,
                "kind": kind,
                "ok": False,
                "origins": origins,
                "destinations": destinations,
                "message": f"{subject}: tiene múltiples páginas destino ({', '.join(f'pág. {page}' for page in destinations)}).",
            }
            global_issues.append(issue)
            for page_name in set(origins + destinations):
                page = pages_by_name.get(page_name)
                if page:
                    page["recortableIssues"].append({
                        "pageName": page_name,
                        "code": label,
                        "message": issue["message"],
                        "severity": "error",
                    })
            continue

        if not origins and destinations:
            subject = label if kind == "video" else f"{pretty_kind} {code}"
            issue = {
                "code": code,
                "label": label,
                "kind": kind,
                "ok": False,
                "origins": [],
                "destination": destinations[0] if len(destinations) == 1 else "",
                "message": f"{subject}: existe página destino (pág. {', pág. '.join(destinations)}) pero no se encontró página origen.",
            }
            global_issues.append(issue)
            for page_name in destinations:
                page = pages_by_name.get(page_name)
                if page:
                    page["recortableIssues"].append({
                        "pageName": page_name,
                        "code": label,
                        "message": issue["message"],
                        "severity": "error",
                    })
            continue

        if kind == "recortable" and origins and len(destinations) == 1:
            destination = destinations[0]
            if not entry["destinationHasFooter"].get(destination):
                issue = {
                    "code": code,
                    "label": label,
                    "kind": kind,
                    "ok": False,
                    "origins": origins,
                    "destination": destination,
                    "message": f"Recortable {code}: la página destino pág. {destination} no contiene 'recortable' en 12_01 PIE DE PAGINA DERCHO.",
                }
                global_issues.append(issue)
                for page_name in origins + [destination]:
                    page = pages_by_name.get(page_name)
                    if page:
                        page["recortableIssues"].append({
                            "pageName": page_name,
                            "code": label,
                            "message": issue["message"],
                            "severity": "error",
                        })

    for page in page_reports or []:
        page["recortableSummary"]["hasError"] = bool(page["recortableIssues"])
    return global_issues, page_reports


def _build_document_insights(session, pages, swatches, styles, stories):
    applied_masters = sorted({
        str((page or {}).get("appliedMaster") or "").strip()
        for page in (pages or [])
        if str((page or {}).get("appliedMaster") or "").strip()
    })
    return {
        "configurationWarnings": _build_configuration_warnings(session),
        "pagePreview": _build_page_preview(pages),
        "swatchInventory": _build_swatch_inventory(swatches),
        "topParagraphStyles": _build_style_usage(stories, styles, "paragraphStyleIds", "paragraphStyles"),
        "topCharacterStyles": _build_style_usage(stories, styles, "characterStyleIds", "characterStyles"),
        "topStories": _build_story_preview(stories),
        "appliedMasters": applied_masters[:12],
        "pageReports": _build_page_reports(pages, stories, styles),
    }


def analyze_idml_document(input_path, session):
    started_at = perf_counter()
    alias_index = _build_mapping_alias_index(session)
    with open_idml(input_path) as archive:
        document_summary = build_document_summary(input_path, session)
        designmap = parse_designmap(archive)
        swatches = parse_swatches(archive, designmap.get("graphicSource") or "Resources/Graphic.xml")
        styles = parse_styles(archive, designmap.get("stylesSource") or "Resources/Styles.xml")
        alias_index = _expand_alias_index_with_style_inheritance(
            alias_index,
            styles,
            allow_name_variants=not _has_explicit_mapping(session),
        )
        pages = parse_pages(archive, designmap.get("spreadSources") or None)
        master_spreads = parse_master_spreads(archive, designmap.get("masterSpreadSources") or None)
        stories = parse_stories(archive, designmap.get("storySources") or None)
        story_preview_index = {
            str((story or {}).get("storyId") or "").strip(): story
            for story in (stories or [])
            if str((story or {}).get("storyId") or "").strip()
        }
        text_char_count = sum(len(entry["text"]) for entry in stories)
        pagination_rows = build_pagination_report(pages)
        pagination_issues = find_pagination_issues(pages)
        section_issues = find_section_issues(pages, stories, session)
        color_issues = find_color_issues(swatches, (((session or {}).get("colorConfig")) or {}).get("palette") or [])
        page_reports = _build_page_reports(pages, stories, styles, alias_index=alias_index)
        page_reports = _apply_master_content(page_reports, master_spreads, stories, styles, alias_index=alias_index)
        swatch_lookup = _build_swatch_lookup(swatches)
        configured_swatch_entries = _build_mapping_swatch_entries(alias_index)
        gemini_verifier = GeminiVerifier()
        for page in page_reports:
            page["aliasValues"] = _extract_alias_values(page, alias_index=alias_index, include_master=True)
            page["fieldProfiles"] = _extract_field_profiles(page, swatch_lookup, alias_index=alias_index)
            page["configuredSwatches"] = _extract_configured_swatch_matches(page, swatch_lookup, configured_swatch_entries)
            page["footerMarkers"] = _extract_footer_markers(page, alias_index=alias_index, session=session, gemini_verifier=gemini_verifier)
        semantic_blocks = _select_semantic_story_blocks(_build_semantic_blocks(page_reports))
        spelling_issues = find_spelling_issues(semantic_blocks, gemini_verifier=gemini_verifier)
        orthotypography_issues = find_orthotypography_issues(semantic_blocks, gemini_verifier=gemini_verifier)
        page_reports = _attach_page_level_findings(page_reports, pagination_rows, spelling_issues, orthotypography_issues)
        note_issues, note_history_issues, page_reports = _attach_page_notes(page_reports, stories)
        recortable_issues, page_reports = _build_recortable_checks(
            page_reports,
            alias_index=alias_index,
            session=session,
            gemini_verifier=gemini_verifier,
            story_preview_index=story_preview_index,
        )
        insights = _build_document_insights(session, pages, swatches, styles, stories)
        insights["pageReports"] = page_reports

        return {
            "paginationIssues": pagination_issues,
            "sectionIssues": section_issues,
            "spellingIssues": spelling_issues,
            "orthotypographyIssues": orthotypography_issues,
            "noteIssues": note_issues,
            "noteHistoryIssues": note_history_issues,
            "colorIssues": color_issues,
            "recortableIssues": recortable_issues,
            "stats": {
                "documentName": document_summary["name"],
                "storyCount": len(stories),
                "pageCount": len(pages),
                "paragraphStyleCount": len(styles["paragraphStyles"]),
                "characterStyleCount": len(styles["characterStyles"]),
                "usedSwatches": [entry["name"] for entry in swatches[:20]],
                "swatchCount": len(swatches),
                "textCharacterCount": text_char_count,
                "semanticStoryCount": len(semantic_blocks),
                "declaredStoryCount": len(designmap.get("storyList", [])),
                "spreadCount": len(designmap.get("spreadSources", [])),
                "masterSpreadCount": len(designmap.get("masterSpreadSources", [])),
                "sourceType": "idml",
                "geminiVerifierEnabled": bool(gemini_verifier.enabled),
                **insights,
                "durationMs": int((perf_counter() - started_at) * 1000),
            },
        }
