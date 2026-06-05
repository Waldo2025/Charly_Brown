import re

from .config import (
    AGENDA_PAGE_MARKERS,
    INDEX_PAGE_MARKERS,
    INTRO_PAGE_MARKERS,
    LEGAL_PAGE_MARKERS,
    LOW_SIGNAL_PAGE_TEXT_LEN,
    SECTION_HEADING_MIN_SIZE,
    SECTION_HEADING_TOP_RATIO,
)
from .labels import build_pdf_page_label_map
from .utils import clean_spell_text, normalize_text


def extract_heading_candidates(page_dict):
    height = float(page_dict.get("height") or 0)
    candidates = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = " ".join((span.get("text") or "").strip() for span in spans).strip()
            if not text:
                continue
            bbox = line.get("bbox") or [0, 0, 0, 0]
            top = float(bbox[1] or 0)
            if top > height * SECTION_HEADING_TOP_RATIO:
                continue
            max_size = max((float(span.get("size") or 0) for span in spans), default=0.0)
            if max_size < SECTION_HEADING_MIN_SIZE:
                continue
            if re.search(r"\d", text):
                continue
            normalized = normalize_text(text)
            if not normalized or normalized.startswith("unidad "):
                continue
            candidates.append({
                "text": text,
                "normalized": normalized,
                "size": max_size,
                "top": top,
            })
    candidates.sort(key=lambda item: (item["top"], -item["size"]))
    return candidates


def detect_printed_page_number(page_dict, pdf_page_number: int = 1) -> int:
    height = float(page_dict.get("height") or 0)
    width = float(page_dict.get("width") or 0)
    is_even_page = int(pdf_page_number or 1) % 2 == 0
    strict_candidates = []
    fallback_candidates = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = " ".join((span.get("text") or "").strip() for span in spans).strip()
            if not re.fullmatch(r"\d{1,4}", text):
                continue
            bbox = line.get("bbox") or [0, 0, 0, 0]
            top = float(bbox[1] or 0)
            bottom = float(bbox[3] or 0)
            left = float(bbox[0] or 0)
            right = float(bbox[2] or 0)
            center_x = (left + right) / 2.0
            line_height = max(1.0, bottom - top)
            if top < height * 0.72:
                continue
            if line_height > height * 0.08:
                continue
            zone_priority = 3.0 if ((is_even_page and center_x <= width * 0.24) or ((not is_even_page) and center_x >= width * 0.76)) else 1.0
            rank = (
                round(bottom / max(height, 1.0), 5),
                zone_priority,
                round(-(line_height / max(height, 1.0)), 5),
            )
            candidate = (int(text), rank)
            if top >= height * 0.9:
                strict_candidates.append(candidate)
            else:
                fallback_candidates.append(candidate)
    candidates = strict_candidates or fallback_candidates
    if not candidates:
        return 0
    candidates.sort(key=lambda item: item[1], reverse=True)
    return int(candidates[0][0])


def classify_page_type(page_record):
    normalized = str(page_record.get("normalizedText") or "")
    spell_text = str(page_record.get("spellText") or "").strip()
    logical_page = int(page_record.get("logicalPageNumber") or 0)
    printed_page = int(page_record.get("printedPageNumber") or 0)
    headings = page_record.get("headingCandidates") or []
    if logical_page == 1 and printed_page == 0:
        return "cover"
    if any(marker in normalized for marker in LEGAL_PAGE_MARKERS):
        return "legal"
    if "indice" in normalized and sum(char.isdigit() for char in spell_text) >= 8:
        return "index"
    if sum(marker in normalized for marker in AGENDA_PAGE_MARKERS) >= 2 and len(re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", spell_text)) < 20:
        return "agenda"
    if logical_page <= 5 and any(marker in normalized for marker in INTRO_PAGE_MARKERS):
        return "intro"
    if headings and any(entry["normalized"] == "unidad 1" for entry in headings):
        return "unit-overview"
    if "unidad 1" in normalized and len(headings) <= 1:
        return "unit-overview"
    if len(spell_text) < LOW_SIGNAL_PAGE_TEXT_LEN:
        return "low-signal"
    return "content"


def build_page_records(doc):
    pdf_page_labels = build_pdf_page_label_map(doc)
    pages = []
    for index in range(len(doc)):
        page = doc.load_page(index)
        page_dict = page.get_text("dict", sort=True)
        text = page.get_text("text", sort=True)
        pdf_page_number = index + 1
        visual_page_number = detect_printed_page_number(page_dict, pdf_page_number)
        pdf_label = pdf_page_labels.get(pdf_page_number) or {}
        logical_page_number = int(pdf_label.get("number") or visual_page_number or 0)
        logical_page_label = str(pdf_label.get("label") or (str(visual_page_number) if visual_page_number > 0 else ""))
        page_record = {
            "pdfPageNumber": pdf_page_number,
            "printedPageNumber": visual_page_number,
            "logicalPageNumber": logical_page_number,
            "logicalPageLabel": logical_page_label,
            "logicalPageKind": str(pdf_label.get("kind") or ("arabic" if visual_page_number > 0 else "")),
            "logicalPageSource": str(pdf_label.get("source") or ("printed" if visual_page_number > 0 else "")),
            "logicalPageRuleStartPage": int(pdf_label.get("ruleStartPage") or 0),
            "logicalPageRuleStyle": str(pdf_label.get("ruleStyle") or ""),
            "text": text,
            "spellText": clean_spell_text(text),
            "normalizedText": normalize_text(text),
            "dict": page_dict,
            "headingCandidates": extract_heading_candidates(page_dict),
        }
        page_record["pageType"] = classify_page_type(page_record)
        pages.append(page_record)
    return pages

