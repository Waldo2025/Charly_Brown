import re
import sys
import unicodedata


def debug_log(stage: str, **payload):
    parts = [f"[analyze_pdf.py] {stage}"]
    for key, value in payload.items():
        parts.append(f"{key}={value}")
    sys.stderr.write(" ".join(parts) + "\n")
    sys.stderr.flush()


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", text).strip().lower()


def compact_alpha(value: str) -> str:
    return re.sub(r"[^a-z]", "", normalize_text(value))


def chunk_text(text: str, max_chars: int = 4000):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean:
        return
    start = 0
    while start < len(clean):
        end = min(len(clean), start + max_chars)
        if end < len(clean):
            split = clean.rfind(". ", start, end)
            if split > start + 500:
                end = split + 1
        yield clean[start:end].strip()
        start = end


def clean_spell_text(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])[\u00ad­]\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])", r"\1\2", text)
    text = text.replace("\u00ad", "")
    text = text.replace("­", "")
    text = re.sub(r"([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\s*\n\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])", r"\1\2", text)
    text = re.sub(r"([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])\s*\n\s*([a-záéíóúüñ])", r"\1 \2", text)
    text = re.sub(r"https?://\S+", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bwww\.\S+\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b\S*[_/\\]\S*\b", " ", text)
    text = re.sub(r"\b\S+\.pdf\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bISBN[:\s0-9-]+\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"[©®™]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def build_context(text: str, start: int, length: int, radius: int = 48):
    source = str(text or "")
    left = max(0, start - radius)
    right = min(len(source), start + length + radius)
    return source[left:right].strip()

