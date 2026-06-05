import json
import os
import socket
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def load_local_env():
    current = Path(__file__).resolve()
    for parent in current.parents:
        env_path = parent / ".env"
        if not env_path.exists():
            continue
        values = {}
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = str(raw_line or "").strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if key:
                values[key] = value
        return values
    return {}


class GeminiVerifier:
    def __init__(self):
        local_env = load_local_env()
        self.api_key = str(
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or local_env.get("GEMINI_API_KEY")
            or local_env.get("GOOGLE_API_KEY")
            or ""
        ).strip()
        self.model = str(os.getenv("ANALIZAR_PDF_GEMINI_MODEL") or "gemini-2.5-flash").strip()
        self.enabled = bool(self.api_key)
        self.timeout_sec = float(os.getenv("ANALIZAR_PDF_GEMINI_TIMEOUT_SEC") or 20.0)

    def _endpoint(self):
        model = urllib.parse.quote(self.model, safe="")
        key = urllib.parse.quote(self.api_key, safe="")
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

    def _extract_text(self, payload):
        try:
            candidates = payload.get("candidates") or []
            parts = (((candidates[0] or {}).get("content") or {}).get("parts")) or []
            return "".join(str(part.get("text") or "") for part in parts).strip()
        except Exception:
            return ""

    def _post_json(self, body):
        request = urllib.request.Request(
            self._endpoint(),
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout_sec) as response:
            return json.loads(response.read().decode("utf-8"))

    def verify_chunk_candidates(self, chunk, page, candidates):
        if not self.enabled or not candidates:
            return []
        candidate_tokens = [item.get("token") for item in candidates if str(item.get("token") or "").strip()]
        if not candidate_tokens:
            return []
        prompt = (
            "Eres un corrector ortográfico muy preciso para español de libros escolares.\n"
            "Debes revisar SOLO los candidatos dados y decidir cuáles son errores ortográficos reales dentro del contexto.\n"
            "Ignora nombres propios, vocabulario válido poco común, encabezados, pies, índices, texto de maquetación, duplicaciones por extracción PDF, palabras cortadas por salto de línea y ruido visual.\n"
            "Responde SOLO JSON válido con un array. Cada item debe tener: token, suggestion, reason.\n"
            "Si ningún candidato es un error real, responde [].\n\n"
            f"Página PDF: {page.get('pdfPageNumber')}\n"
            f"Página lógica: {page.get('logicalPageLabel') or page.get('logicalPageNumber')}\n"
            f"Candidatos: {json.dumps(candidate_tokens, ensure_ascii=False)}\n"
            f"Contexto:\n{chunk}\n"
        )
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }
        try:
            response = self._post_json(body)
            text = self._extract_text(response)
            if not text:
                return []
            parsed = json.loads(text)
            if not isinstance(parsed, list):
                return []
            accepted = []
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                token = str(item.get("token") or "").strip()
                suggestion = str(item.get("suggestion") or "").strip()
                reason = str(item.get("reason") or "").strip()
                if not token or not suggestion:
                    continue
                accepted.append({
                    "token": token,
                    "suggestion": suggestion,
                    "reason": reason,
                })
            return accepted
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            socket.timeout,
            TimeoutError,
            json.JSONDecodeError,
            ValueError,
        ):
            return []
