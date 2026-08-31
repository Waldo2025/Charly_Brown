import re
import unicodedata


TEXT_FIELDS = {"visibleText", "pageText", "fileName", "layer", "paragraphStyle", "characterStyle", "swatch", "story", "frameStatus", "notes", "trackedChanges", "linkedAssets"}


def _text(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_text(item) for item in value.values())
    return str(value)


def _fold(value):
    normalized = unicodedata.normalize("NFKD", _text(value).casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _page_text(page):
    explicit = _text(page.get("pageText") or page.get("text") or "").strip()
    if explicit:
        return explicit
    chunks = []
    for key in ("content", "blocks", "semanticBlocks", "paragraphs"):
        value = page.get(key)
        if value:
            chunks.append(_text(value))
    return " ".join(" ".join(chunks).split())


def _collect_named(value, names, output=None):
    output = output if output is not None else []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in names and item not in (None, "", [], {}):
                output.append(_text(item))
            _collect_named(item, names, output)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _collect_named(item, names, output)
    return output


def _values(page, field, session):
    if field in {"visibleText", "pageText"}:
        return _page_text(page)
    if field == "fileName":
        return session.get("activeFileName") or session.get("title") or ""
    if field == "page":
        return page.get("pageName") or ""
    mapping = {
        "layer": ("layerName", "layerId", "layers"),
        "paragraphStyle": ("paragraphStyles", "styleName", "styles"),
        "characterStyle": ("characterStyles",),
        "swatch": ("swatches", "swatchNames", "usedSwatches"),
        "story": ("storyId", "storyTitle", "stories"),
        "frameStatus": ("textStatus", "frameStatus", "status"),
        "notes": ("notes", "noteHistory"),
        "trackedChanges": ("trackedChanges",),
        "linkedAssets": ("recortableIssues", "recortableSummary"),
    }
    keys = mapping.get(field, (field,))
    return " ".join(_collect_named(page, set(keys)))


def _predicate_matches(node, page, session):
    actual = _values(page, node.get("field"), session)
    expected = _text(node.get("value"))
    comparator = node.get("comparator") or "contains"
    left, right = _fold(actual), _fold(expected)
    if comparator == "contains": result = right in left
    elif comparator == "not_contains": result = right not in left
    elif comparator == "equals": result = left == right
    elif comparator == "not_equals": result = left != right
    elif comparator == "starts_with": result = left.startswith(right)
    elif comparator == "ends_with": result = left.endswith(right)
    elif comparator == "whole_word": result = bool(re.search(r"(?<!\w)" + re.escape(right) + r"(?!\w)", left, re.UNICODE))
    elif comparator == "exists": result = bool(left.strip())
    elif comparator == "not_exists": result = not bool(left.strip())
    elif comparator in {"count_eq", "count_gt", "count_lt"}:
        count = len(actual) if isinstance(actual, (list, tuple, set, dict)) else len(re.findall(re.escape(right), left)) if right else len(left.split())
        try: target = int(float(expected))
        except (TypeError, ValueError): target = 0
        result = count == target if comparator == "count_eq" else count > target if comparator == "count_gt" else count < target
    elif comparator == "guided_pattern":
        patterns = {"double_space": r"\S {2,}\S", "unbalanced_parentheses": r"\([^)]*$|^[^(]*\)", "repeated_punctuation": r"([,.;:!?])\1+"}
        result = bool(re.search(patterns.get(expected, r"(?!x)x"), actual))
    else: result = False
    return not result if node.get("negate") else result


def _tree_matches(node, page, session):
    if not isinstance(node, dict):
        return True
    if node.get("type") == "predicate":
        return _predicate_matches(node, page, session)
    children = node.get("children") if isinstance(node.get("children"), list) else []
    result = all(_tree_matches(child, page, session) for child in children) if node.get("operator") != "any" else any(_tree_matches(child, page, session) for child in children)
    return not result if node.get("negate") else result


def _in_scope(rule, session, language_code, page=None):
    languages = rule.get("languages") if isinstance(rule.get("languages"), list) else []
    workflows = rule.get("workflowFormats") if isinstance(rule.get("workflowFormats"), list) else []
    if languages and "auto" not in languages and language_code not in languages:
        return False
    if workflows and (session.get("workflowFormat") or "en_forma") not in workflows:
        return False
    units = [_fold(value) for value in (rule.get("units") or [])]
    if units and _fold(session.get("bibliographicInfo", {}).get("unidad")) not in units:
        return False
    file_types = [_fold(value) for value in (rule.get("fileTypes") or [])]
    if file_types and _fold(session.get("sourceType") or "idml") not in file_types:
        return False
    if page is None:
        return True
    page_number_match = re.search(r"\d+", _text(page.get("pageName")))
    page_number = int(page_number_match.group(0)) if page_number_match else 0
    page_range = rule.get("pageRange") if isinstance(rule.get("pageRange"), dict) else {}
    if page_range.get("from") and page_number < int(page_range["from"]): return False
    if page_range.get("to") and page_number > int(page_range["to"]): return False
    layers = [_fold(value) for value in (rule.get("layers") or [])]
    if layers and not any(value in _fold(_values(page, "layer", session)) for value in layers): return False
    styles = [_fold(value) for value in (rule.get("styles") or [])]
    if styles and not any(value in _fold(_values(page, "paragraphStyle", session) + " " + _values(page, "characterStyle", session)) for value in styles): return False
    return True


def _issue(rule, page, mechanism, context="", suggestion=""):
    return {
        "ruleId": rule.get("id") or "",
        "ruleName": rule.get("name") or "Condición personalizada",
        "severity": rule.get("severity") or "warning",
        "pageName": page.get("pageName") or "Sin página",
        "layerId": page.get("layerId") or "",
        "layerName": page.get("layerName") or "",
        "context": context or _page_text(page)[:900],
        "excerpt": context[:600] if context else _page_text(page)[:600],
        "message": rule.get("message") or rule.get("name") or "Condición encontrada",
        "suggestion": suggestion or rule.get("suggestion") or "",
        "mechanism": mechanism,
        "providers": ["Gemini"] if mechanism == "Gemini" else ["Regla guiada"],
    }


def evaluate_custom_rules(page_reports, session, language, gemini_verifier=None):
    config = session.get("analysisRuleConfig") if isinstance(session, dict) else {}
    config = config if isinstance(config, dict) else {}
    active_ids = set(config.get("customRuleIds") or [])
    rules = [rule for rule in (config.get("customRules") or []) if isinstance(rule, dict) and rule.get("id") in active_ids and rule.get("enabled", True)]
    categories = session.get("analysisCategories") if isinstance(session.get("analysisCategories"), dict) else {}
    if categories.get("custom-rules") is False:
        return [], {"catalogVersion": config.get("catalogVersion") or "", "activeRuleIds": list(active_ids), "executedRuleIds": [], "unavailableRuleIds": [], "disabled": True, "issueCount": 0}
    language_code = language.get("resolvedCode") if isinstance(language, dict) else _text(language)
    language_code = language_code or session.get("languageCode") or "und"
    deterministic = [rule for rule in rules if not _text(rule.get("semanticCriterion")).strip()]
    semantic = [rule for rule in rules if _text(rule.get("semanticCriterion")).strip()]
    issues, executed, unavailable = [], [], []
    for rule in deterministic:
        if not _in_scope(rule, session, language_code):
            continue
        executed.append(rule.get("id"))
        for page in page_reports:
            if _in_scope(rule, session, language_code, page) and _tree_matches(rule.get("conditionTree") or {}, page, session):
                found = _issue(rule, page, "Regla guiada")
                issues.append(found)
                page.setdefault("customRuleIssues", []).append(found)
    scoped_semantic = [rule for rule in semantic if _in_scope(rule, session, language_code)]
    if scoped_semantic:
        if not gemini_verifier or not getattr(gemini_verifier, "enabled", False):
            unavailable.extend(rule.get("id") for rule in scoped_semantic)
        else:
            previous = ""
            for page in page_reports:
                page_rules = [rule for rule in scoped_semantic if _in_scope(rule, session, language_code, page)]
                if not page_rules:
                    previous = _page_text(page)
                    continue
                current = _page_text(page)
                response = gemini_verifier.verify_custom_rules_page(page=page, page_text=current, previous_page_text=previous, rules=page_rules, language_code=language_code)
                if response is None:
                    unavailable.extend(rule.get("id") for rule in page_rules)
                    previous = current
                    continue
                executed.extend(rule.get("id") for rule in page_rules)
                by_id = {rule.get("id"): rule for rule in page_rules}
                for match in response:
                    if not isinstance(match, dict) or not match.get("matched") or match.get("ruleId") not in by_id:
                        continue
                    found = _issue(by_id[match["ruleId"]], page, "Gemini", _text(match.get("excerpt") or match.get("reason")), _text(match.get("suggestion")))
                    found["confidence"] = max(0.0, min(1.0, float(match.get("confidence") or 0)))
                    issues.append(found)
                    page.setdefault("customRuleIssues", []).append(found)
                previous = current
    return issues, {"catalogVersion": config.get("catalogVersion") or "", "activeRuleIds": list(active_ids), "executedRuleIds": sorted(set(filter(None, executed))), "unavailableRuleIds": sorted(set(filter(None, unavailable))), "issueCount": len(issues)}
