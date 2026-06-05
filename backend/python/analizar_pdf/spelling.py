import difflib
import re

import enchant

from .config import (
    EN_DICT_CANDIDATES,
    ES_DICT_CANDIDATES,
    MIN_TOKEN_LEN,
    SPELLING_BLOCKLIST,
    SPELL_ISSUE_LIMIT,
)
from .utils import build_context, chunk_text, compact_alpha


def resolve_dict(candidates):
    for code in candidates:
        try:
            return enchant.Dict(code), code
        except enchant.errors.DictNotFoundError:
            continue
    return None, ""


def extract_tokens_with_positions(text: str):
    pattern = r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]{2,}"
    return [(match.group(0), match.start()) for match in re.finditer(pattern, text or "")]


def merge_suggestions(*lists):
    merged = []
    seen = set()
    for values in lists:
        for value in values or []:
            clean = str(value or "").strip()
            if not clean:
                continue
            normalized = clean.lower()
            if normalized in seen:
                continue
            seen.add(normalized)
            merged.append(clean)
            if len(merged) >= 4:
                return merged
    return merged


def collect_dictionary_candidates(chunk, page, es_dict, en_dict, es_code, en_code):
    candidates = []
    for token, offset in extract_tokens_with_positions(chunk):
        if should_ignore_token(token):
            continue
        token_lower = token.lower()
        es_ok = es_dict.check(token_lower) if es_dict is not None else False
        en_ok = en_dict.check(token_lower) if en_dict is not None else False
        if es_ok or en_ok:
            continue
        suggestions = merge_suggestions(
            es_dict.suggest(token) if es_dict is not None else [],
            en_dict.suggest(token) if en_dict is not None else [],
        )
        if not suggestions:
            continue
        candidates.append({
            "token": token,
            "offset": offset,
            "replacements": suggestions,
            "providers": [code for code in (es_code, en_code) if code],
            "page": page,
        })
    return candidates


def is_candidate_page(page):
    return str(page.get("pageType") or "") == "content"


def should_ignore_token(token: str) -> bool:
    clean = str(token or "").strip()
    if len(clean) < MIN_TOKEN_LEN:
        return True
    if "-" in clean:
        return True
    if clean.isupper():
        return True
    if any(char.isdigit() for char in clean):
        return True
    normalized = compact_alpha(clean)
    if not normalized or normalized in SPELLING_BLOCKLIST:
        return True
    if clean[0].isupper() and len(clean) >= 4:
        return True
    return False


def is_suspicious_token_shape(token: str) -> bool:
    raw = str(token or "").strip()
    clean = compact_alpha(raw)
    if not clean:
        return False
    if re.fullmatch(r"([a-z]{2,})\1+", clean):
        return True
    if len(clean) >= 8:
        midpoint = len(clean) // 2
        if len(clean) % 2 == 0 and clean[:midpoint] == clean[midpoint:]:
            return True
    if re.search(r"(.)\1{2,}", clean):
        return True
    return False


def is_reliable_spelling_hit(token: str, suggestions):
    if not suggestions or is_suspicious_token_shape(token):
        return False
    normalized_token = compact_alpha(token)
    raw_token = str(token or "").strip().lower()
    for suggestion in suggestions:
        raw_suggestion = str(suggestion or "").strip()
        if not raw_suggestion or " " in raw_suggestion or "-" in raw_suggestion:
            continue
        if compact_alpha(raw_suggestion) != normalized_token:
            continue
        if raw_suggestion.lower() == raw_token:
            continue
        return True
    return False


def find_spelling_issues(pages, gemini_verifier=None):
    es_dict, es_code = resolve_dict(ES_DICT_CANDIDATES)
    en_dict, en_code = resolve_dict(EN_DICT_CANDIDATES)
    if es_dict is None and en_dict is None:
        raise RuntimeError("No spell dictionaries found. Install PyEnchant dictionaries for Spanish or English.")

    issues = []
    seen = set()
    for page in pages:
        if not is_candidate_page(page):
            continue
        text = str(page.get("spellText") or "")
        if len(text.strip()) < 40:
            continue
        for chunk in chunk_text(text):
            if len(chunk) < 40:
                continue
            candidates = collect_dictionary_candidates(chunk, page, es_dict, en_dict, es_code, en_code)
            if not candidates:
                continue
            accepted_tokens = set()
            accepted_by_gemini = {}
            if gemini_verifier is not None and getattr(gemini_verifier, "enabled", False):
                verified = gemini_verifier.verify_chunk_candidates(chunk, page, candidates)
                for item in verified:
                    token = str(item.get("token") or "").strip()
                    suggestion = str(item.get("suggestion") or "").strip()
                    if not token:
                        continue
                    accepted_tokens.add(token)
                    accepted_by_gemini[token] = item
            for candidate in candidates:
                token = candidate["token"]
                suggestions = candidate["replacements"]
                if gemini_verifier is not None and getattr(gemini_verifier, "enabled", False):
                    if token not in accepted_tokens:
                        continue
                elif not is_reliable_spelling_hit(token, suggestions):
                    continue
                signature = (page["pdfPageNumber"], token, candidate["offset"])
                if signature in seen:
                    continue
                seen.add(signature)
                gemini_item = accepted_by_gemini.get(token) or {}
                issue = {
                    "pdfPageNumber": page["pdfPageNumber"],
                    "printedPageNumber": page.get("logicalPageNumber") or page["printedPageNumber"] or page["pdfPageNumber"],
                    "printedPageLabel": str(page.get("logicalPageLabel") or page.get("printedPageNumber") or page["pdfPageNumber"]),
                    "message": str(gemini_item.get("reason") or "Posible falta de ortografía."),
                    "context": build_context(chunk, candidate["offset"], len(token)),
                    "token": token,
                    "replacements": [str(gemini_item.get("suggestion") or "").strip()] if str(gemini_item.get("suggestion") or "").strip() else suggestions,
                    "providers": candidate["providers"] + (["gemini"] if gemini_item else []),
                }
                issues.append(issue)
                if len(issues) >= SPELL_ISSUE_LIMIT:
                    return issues
    return issues
