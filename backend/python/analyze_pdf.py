#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path

# Redirect both Python prints and native libraries' writes before importing
# them. Keep a separate descriptor exclusively for the JSON result.
RESULT_STREAM = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8")
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())

import fitz

# MuPDF can report repaired cross-reference tables on stdout. This process's
# stdout is exclusively the JSON protocol consumed by the Node worker.
fitz.TOOLS.mupdf_display_warnings(False)
fitz.TOOLS.mupdf_display_errors(False)

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from analizar_pdf.pipeline import analyze_document  # noqa: E402
from analizar_pdf.spelling import find_spelling_issues  # noqa: F401,E402 - pyenchant/enchant.Dict lives in the modular spelling engine
from analizar_pdf.utils import debug_log  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--session-json", default="")
    parser.add_argument("--session-json-file", default="")
    parser.add_argument("--language-tool-base-url", default="")
    return parser.parse_args()


def main():
    args = parse_args()
    debug_log("start", input=args.input)
    session_payload = args.session_json
    if args.session_json_file:
        session_payload = Path(args.session_json_file).read_text(encoding="utf-8")
    session = json.loads(session_payload)
    debug_log("session.loaded", session_id=((session or {}).get("id") or ""), title=((session or {}).get("title") or ""))
    with fitz.open(args.input) as doc:
        debug_log("pdf.opened", page_count=len(doc))
        result = analyze_document(doc, session)
    warnings = fitz.TOOLS.mupdf_warnings()
    if warnings:
        print(warnings, file=sys.stderr)
    result.setdefault("orthotypographyIssues", [])
    result.setdefault("colorIssues", [])
    stats = result.setdefault("stats", {})
    stats.setdefault("sourceType", "pdf")
    debug_log("done", duration_ms=result["stats"]["durationMs"])
    RESULT_STREAM.write(json.dumps(result, ensure_ascii=False))
    RESULT_STREAM.flush()


if __name__ == "__main__":
    main()
