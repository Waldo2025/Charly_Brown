#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from analizar_idml.quick_tools import build_idml_template_from_file  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--session-json", default="")
    parser.add_argument("--session-json-file", default="")
    return parser.parse_args()


def main():
    args = parse_args()
    session_payload = args.session_json
    if args.session_json_file:
        session_payload = Path(args.session_json_file).read_text(encoding="utf-8")
    session = json.loads(session_payload or "{}")
    result = build_idml_template_from_file(args.input, session)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
