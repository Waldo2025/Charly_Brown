def _safe_int(value):
    try:
        return int(str(value or "").strip())
    except (TypeError, ValueError):
        return None


def _to_roman(value):
    number = _safe_int(value)
    if number is None or number <= 0:
        return ""
    numerals = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ]
    result = []
    for arabic, roman in numerals:
        while number >= arabic:
            result.append(roman)
            number -= arabic
    return "".join(result)


def _format_number(style="", number=None):
    clean_style = str(style or "").strip().lower()
    if number is None:
        return ""
    if "roman" in clean_style:
        roman = _to_roman(number)
        return roman.lower() if "lower" in clean_style else roman
    return str(number)


def build_pagination_report(pages):
    rows = []
    expected = None
    for page in pages or []:
        descriptor = (page or {}).get("descriptor") or {}
        numbering_style = str(descriptor.get("numberingStyle") or "").strip() or "Arabic"
        section_start = _safe_int(descriptor.get("sectionPageStart"))
        label = _safe_int((page or {}).get("pageName"))
        page_id = str((page or {}).get("pageId") or "").strip() or "unknown"
        page_name = str((page or {}).get("pageName") or "").strip() or "?"
        if section_start is not None:
            label = section_start
        if label is None:
            rows.append({
                "pageId": page_id,
                "pageName": page_name,
                "expectedPageNumber": None,
                "detectedPageNumber": None,
                "ok": False,
                "numberingStyle": numbering_style,
                "displayLabel": page_name,
                "message": f"La página {page_name} no tiene numeración detectable.",
            })
            continue
        if expected is None:
            expected = label
        ok = label == expected
        expected_display = _format_number(numbering_style, expected)
        detected_display = _format_number(numbering_style, label)
        rows.append({
            "pageId": page_id,
            "pageName": page_name,
            "expectedPageNumber": expected,
            "detectedPageNumber": label,
            "numberingStyle": numbering_style,
            "displayLabel": detected_display or page_name,
            "ok": ok,
            "message": (
                f"Numeración correcta: {detected_display}."
                if ok
                else f"Numeración incorrecta: se esperaba {expected_display} y se encontró {detected_display}."
            ),
        })
        expected = label + 1
    return rows


def find_pagination_issues(pages):
    return [entry["message"] for entry in build_pagination_report(pages) if not entry.get("ok")]
