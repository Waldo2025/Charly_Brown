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
        self.model = str(
            os.getenv("ANALIZAR_IDML_GEMINI_MODEL")
            or os.getenv("ANALIZAR_PDF_GEMINI_MODEL")
            or "gemini-2.5-flash"
        ).strip()
        self.enabled = bool(self.api_key)
        self.timeout_sec = float(
            os.getenv("ANALIZAR_IDML_GEMINI_TIMEOUT_SEC")
            or os.getenv("ANALIZAR_PDF_GEMINI_TIMEOUT_SEC")
            or 6.0
        )

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

    def _build_prompt(self, block, category):
        text = str((block or {}).get("text") or "").strip()
        story_id = str((block or {}).get("storyId") or "").strip()
        story_title = str((block or {}).get("storyTitle") or "").strip()
        page_name = str((block or {}).get("pageName") or "").strip()
        block_type = str((block or {}).get("blockType") or "").strip()
        style_name = str((block or {}).get("styleName") or "").strip()

        category_instructions = {
            "spelling": (
                "Detecta SOLO faltas ortograficas inequivocas. "
                "No propongas mejoras de estilo ni reescrituras. "
                "Ignora nombres propios, codigos, etiquetas tecnicas, siglas, palabras validas poco comunes, "
                "titulos cortos, ruido de maquetacion y texto dudoso."
            ),
            "orthotypography": (
                "Detecta SOLO problemas ortotipograficos claros. "
                "Acepta casos como espacio indebido antes de puntuacion, signos repetidos, "
                "comillas o parentesis desbalanceados y secuencias de puntuacion anomala. "
                "No corrijas estilo opcional ni cambios debatibles."
            ),
        }
        return (
            "Eres un verificador editorial conservador para texto extraido de archivos IDML en espanol.\n"
            f"{category_instructions.get(category, category_instructions['spelling'])}\n"
            "Si no estas completamente seguro, responde [].\n"
            "Responde SOLO JSON valido con un array.\n"
            "Cada item debe tener: excerpt, suggestion, reason.\n"
            "excerpt debe ser una cita textual corta del bloque entregado.\n\n"
            f"Categoria: {category}\n"
            f"Página: {page_name or 'N/A'}\n"
            f"Tipo de bloque: {block_type or 'N/A'}\n"
            f"Estilo de párrafo: {style_name or 'N/A'}\n"
            f"Story ID: {story_id or 'N/A'}\n"
            f"Story title: {story_title or 'N/A'}\n"
            f"Bloque:\n{text}\n"
        )

    def verify_text_block(self, block, category):
        if not self.enabled:
            return []
        text = str((block or {}).get("text") or "").strip()
        if len(text) < 40:
            return []

        body = {
            "contents": [{"parts": [{"text": self._build_prompt(block, category)}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }
        try:
            response = self._post_json(body)
            payload_text = self._extract_text(response)
            if not payload_text:
                return []
            parsed = json.loads(payload_text)
            if not isinstance(parsed, list):
                return []

            accepted = []
            for item in parsed[:8]:
                if not isinstance(item, dict):
                    continue
                excerpt = str(item.get("excerpt") or "").strip()
                suggestion = str(item.get("suggestion") or "").strip()
                reason = str(item.get("reason") or "").strip()
                if not excerpt or not suggestion or not reason:
                    continue
                accepted.append({
                    "excerpt": excerpt,
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

    def parse_unit_footer_text(self, *, page_name="", footer_text=""):
        if not self.enabled:
            return {}
        normalized_text = " ".join(str(footer_text or "").split()).strip()
        if len(normalized_text) < 12:
            return {}

        prompt = (
            "Eres un parser conservador de textos editoriales extraídos de IDML en español.\n"
            "Recibirás el contenido completo de una sola caja de texto cuyo estilo de párrafo corresponde al pie de página de una unidad normal.\n"
            "Extrae SOLO estas partes si están presentes en el texto visible:\n"
            "- sectionCode: valor tipo 'Unidad 1'\n"
            "- grade: valor tipo 'Nivel 2'\n"
            "- trimester: valor tipo 'Trimestre 1'\n"
            "- sectionName: el nombre de la sección restante, por ejemplo 'Expresión escrita'\n"
            "Reglas:\n"
            "- No inventes campos.\n"
            "- No cambies palabras.\n"
            "- Si un campo no existe claramente, devuélvelo vacío.\n"
            "- Responde SOLO JSON válido con esta forma exacta:\n"
            "{\"sectionCode\":\"\",\"grade\":\"\",\"trimester\":\"\",\"sectionName\":\"\"}\n"
            f"Página: {page_name or 'N/A'}\n"
            f"Texto: {normalized_text}\n"
        )
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
            },
        }
        try:
            response = self._post_json(body)
            payload_text = self._extract_text(response)
            if not payload_text:
                return {}
            parsed = json.loads(payload_text)
            if not isinstance(parsed, dict):
                return {}
            accepted = {}
            for key in ("sectionCode", "grade", "trimester", "sectionName"):
                value = str(parsed.get(key) or "").strip()
                if value:
                    accepted[key] = value
            return accepted
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            socket.timeout,
            TimeoutError,
            json.JSONDecodeError,
            ValueError,
        ):
            return {}

    def classify_linked_asset_visual(self, *, page_name="", image_base64="", mime_type="image/jpeg"):
        if not self.enabled:
            return {}
        if not image_base64:
            return {}
        prompt = (
            "Eres un verificador editorial visual para material escolar de primaria.\n"
            "Debes identificar TODOS los recursos visibles señalados por iconos y extraer la referencia visible que acompaña a cada uno.\n"
            "Tipos válidos: recortable, anexo, ficha, video, unknown.\n"
            "Para recortable, anexo y ficha, la referencia suele verse como 1aT1, 1dT1, 2bT3, etc.\n"
            "Para video, no inventes códigos: extrae el nombre o título visible si aparece.\n"
            "Si no es claro, usa unknown con code vacío y title vacío.\n"
            "Pistas visuales comunes:\n"
            "- tijeras o área punteada: recortable\n"
            "- clip o sujetapapeles: anexo\n"
            "- icono de tarjeta/hoja de actividad: ficha\n"
            "- icono de play/pantalla: video\n"
            "Puede haber varios recursos en la misma imagen.\n"
            "Responde SOLO JSON con esta forma: {\"assets\":[{\"kind\":\"...\",\"code\":\"...\",\"title\":\"...\",\"confidence\":\"...\",\"reason\":\"...\"}]}.\n"
            f"Página: {page_name or 'N/A'}\n"
        )
        body = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type or "image/jpeg", "data": image_base64}},
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }
        try:
            response = self._post_json(body)
            payload_text = self._extract_text(response)
            if not payload_text:
                return {}
            parsed = json.loads(payload_text)
            if not isinstance(parsed, dict):
                return {}
            raw_assets = parsed.get("assets")
            if not isinstance(raw_assets, list):
                raw_assets = [parsed]
            assets = []
            for item in raw_assets[:8]:
                if not isinstance(item, dict):
                    continue
                kind = str(item.get("kind") or "").strip().lower()
                code = str(item.get("code") or "").strip()
                title = str(item.get("title") or "").strip()
                confidence = str(item.get("confidence") or "").strip().lower()
                reason = str(item.get("reason") or "").strip()
                if kind not in {"recortable", "anexo", "ficha", "video", "unknown"}:
                    continue
                assets.append({
                    "kind": kind,
                    "code": code,
                    "title": title,
                    "confidence": confidence,
                    "reason": reason,
                })
            if not assets:
                return {}
            return {"assets": assets}
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            socket.timeout,
            TimeoutError,
            json.JSONDecodeError,
            ValueError,
        ):
            return {}
