import re


def int_to_roman(value: int) -> str:
    number = int(value or 0)
    if number <= 0:
        return ""
    numerals = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ]
    parts = []
    remainder = number
    for arabic, roman in numerals:
        while remainder >= arabic:
            parts.append(roman)
            remainder -= arabic
    return "".join(parts)


def roman_to_int(value: str) -> int:
    source = str(value or "").strip().upper()
    if not source or not re.fullmatch(r"[IVXLCDM]+", source):
        return 0
    mapping = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    previous = 0
    for char in reversed(source):
        current = mapping.get(char, 0)
        if current < previous:
            total -= current
        else:
            total += current
            previous = current
    return total


def parse_page_label(raw_text: str):
    text = str(raw_text or "").strip()
    compact = re.sub(r"\s+", "", text)
    if re.fullmatch(r"\d{1,4}", compact):
        return {"label": compact, "number": int(compact), "kind": "arabic"}
    if re.fullmatch(r"(?i)[ivxlcdm]{1,12}", compact):
        roman_value = roman_to_int(compact)
        if roman_value > 0:
            return {"label": compact.upper(), "number": roman_value, "kind": "roman"}
    return None


def format_page_label(style: str, number: int) -> str:
    kind = str(style or "").strip()
    value = int(number or 0)
    if not kind:
        return ""
    if kind == "D":
        return str(value)
    if kind == "R":
        return int_to_roman(value)
    if kind == "r":
        return int_to_roman(value).lower()
    if kind == "A" and value > 0:
        return chr(ord("A") + ((value - 1) % 26))
    if kind == "a" and value > 0:
        return chr(ord("a") + ((value - 1) % 26))
    return ""


def build_pdf_page_label_map(doc):
    try:
        labels = list(doc.get_page_labels() or [])
    except Exception:
        labels = []
    if not labels:
        return {}
    mapping = {}
    sorted_labels = sorted(
        [entry for entry in labels if isinstance(entry, dict)],
        key=lambda item: int(item.get("startpage") or 0),
    )
    for index in range(len(doc)):
        active = None
        for entry in sorted_labels:
            if int(entry.get("startpage") or 0) <= index:
                active = entry
            else:
                break
        if active is None:
            continue
        start_page = int(active.get("startpage") or 0)
        prefix = str(active.get("prefix") or "")
        first_page_num = int(active.get("firstpagenum") or 1)
        style = str(active.get("style") or "").strip()
        logical_number = first_page_num + (index - start_page)
        logical_label = f"{prefix}{format_page_label(style, logical_number)}" if style else prefix
        parsed = parse_page_label(logical_label)
        mapping[index + 1] = {
            "label": logical_label,
            "number": int(parsed.get("number") if parsed else logical_number),
            "kind": str(parsed.get("kind") if parsed else style or "").strip() or "metadata",
            "source": "pdf-label",
            "ruleStartPage": start_page + 1,
            "ruleStyle": style,
        }
    return mapping

