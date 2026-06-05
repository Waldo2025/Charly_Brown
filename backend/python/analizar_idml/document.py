from pathlib import Path


def build_document_summary(input_path, session):
    return {
        "name": Path(input_path).name,
        "sessionId": str((session or {}).get("id") or "").strip(),
    }
