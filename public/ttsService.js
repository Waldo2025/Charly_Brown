const { HfInference } = require('@huggingface/inference');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

// Cache para almacenar audios generados (válido por 24 horas)
const audioCache = new NodeCache({ stdTTL: 86400 });

class TTSService {
  constructor(apiKey) {
    this.hf = new HfInference(apiKey);
  }

  async generate(text, options = {}) {
    const { model = 'facebook/vits-tts-es', speed = 1.0, tone = 'neutral' } = options;
    
    // Crear una clave única para el cache
    const cacheKey = `${model}-${speed}-${tone}-${text}`;
    
    // Verificar si ya existe en cache
    const cachedAudio = audioCache.get(cacheKey);
    if (cachedAudio) {
      return cachedAudio;
    }
    
    // Generar audio usando Hugging Face
    try {
      const response = await this.hf.textToSpeech({
        model: model,
        inputs: text,
        parameters: {
          speed: speed,
          emotion: tone
        }
      });
      
      // Almacenar en cache
      audioCache.set(cacheKey, response);
      
      return response;
    } catch (error) {
      throw new Error('Failed to generate audio');
    }
  }
}

module.exports = TTSService;