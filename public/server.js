const express = require('express');
const cors = require('cors');
const TTSService = require('./ttsService');

const app = express();
const port = process.env.PORT || 3000;

// Configuración
const HF_API_KEY = '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'; // Reemplaza con tu API key
const ttsService = new TTSService(HF_API_KEY);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Endpoint TTS
app.post('/api/generate-tts', async (req, res) => {
  const { text, model, speed, tone } = req.body;
  
  // Validación
  if (!text || typeof text !== 'string' || text.length > 1000) {
    return res.status(400).json({ error: "Texto inválido. Máximo 1000 caracteres." });
  }
  
  try {
    const audio = await ttsService.generate(text, { 
      model: model || 'facebook/vits-tts-es',
      speed: parseFloat(speed) || 1.0,
      tone: tone || 'neutral'
    });
    
    res.set('Content-Type', 'audio/wav');
    res.send(audio);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor TTS escuchando en http://localhost:${port}`);
});