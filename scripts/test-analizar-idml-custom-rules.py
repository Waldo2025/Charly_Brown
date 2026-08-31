import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "python"))

from analizar_idml.custom_rules import evaluate_custom_rules


def test_nested_all_any_and_negation():
    rule = {
        "id": "rule_test",
        "name": "Regla de prueba",
        "enabled": True,
        "severity": "warning",
        "message": "Se encontró el patrón",
        "conditionTree": {
            "type": "group", "operator": "all", "negate": False, "children": [
                {"type": "predicate", "field": "pageText", "comparator": "contains", "value": "actividad", "negate": False},
                {"type": "group", "operator": "any", "negate": False, "children": [
                    {"type": "predicate", "field": "layer", "comparator": "contains", "value": "trabajo", "negate": False},
                    {"type": "predicate", "field": "pageText", "comparator": "contains", "value": "imposible", "negate": True},
                ]},
            ]
        },
    }
    session = {"workflowFormat": "libre", "languageCode": "es-MX", "analysisRuleConfig": {"customRuleIds": ["rule_test"], "customRules": [rule]}}
    pages = [{"pageName": "1", "pageText": "Actividad para completar.", "layerName": "TRABAJO"}]
    issues, stats = evaluate_custom_rules(pages, session, {"resolvedCode": "es-MX"})
    assert len(issues) == 1
    assert issues[0]["ruleId"] == "rule_test"
    assert stats["executedRuleIds"] == ["rule_test"]


if __name__ == "__main__":
    test_nested_all_any_and_negation()
    print("custom rules: ok")
