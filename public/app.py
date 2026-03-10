from flask import Flask, request, send_file, jsonify
from diffusers import AutoPipelineForText2Image
import torch
from io import BytesIO
from PIL import Image
import os

# ⚙️ Inicializa Flask y configura ruta base
app = Flask(__name__, static_url_path='', static_folder='.')

# 🧠 Carga el modelo solo una vez al inicio
pipeline = AutoPipelineForText2Image.from_pretrained(
    'black-forest-labs/FLUX.1-dev',
    torch_dtype=torch.float16,
    use_auth_token="__HF_API_KEY_LOCAL__"
).to('cuda')

# 🎯 Cargar LoRA personalizada
pipeline.load_lora_weights('LucAI12/rud22rm', weight_name='lora.safetensors')

# 🖼️ Ruta para generar imagen
@app.route('/generar', methods=['POST'])
def generar():
    try:
        prompt = request.json.get('prompt', 'una imagen educativa')
        image = pipeline(prompt).images[0]

        buffer = BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        return send_file(buffer, mimetype='image/png')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 🏡 Ruta para servir crearUnidad.html
@app.route('/')
def index():
    return app.send_static_file('crearUnidad.html')

# 🚀 Ejecuta el servidor
if __name__ == '__main__':
    app.run(debug=True)
