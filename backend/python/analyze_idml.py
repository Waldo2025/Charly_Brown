#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from analizar_idml.pipeline import analyze_idml_document  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--session-json", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    session = json.loads(args.session_json)
    result = analyze_idml_document(args.input, session)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
