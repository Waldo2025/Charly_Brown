require('electron-reload')(__dirname, {
  electron: require(`${__dirname}/node_modules/electron`)
});

const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');

let server; // Para poder cerrarlo al salir

async function createServer() {
  return new Promise((resolve, reject) => {
    const expressApp = express();
    const publicPath = path.join(__dirname, 'public');
    const GEMINI_EPHEMERAL_URL = 'https://generativelanguage.googleapis.com/v1beta/authTokens';

    // Servimos la carpeta "public" como estático
    expressApp.use(express.json({ limit: '1mb' }));
    expressApp.use(express.static(publicPath));

    expressApp.post('/api/gemini-live/token', async (req, res) => {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
      if (!apiKey) {
        return res.status(500).json({
          error: 'Falta GEMINI_API_KEY o GOOGLE_API_KEY en variables de entorno.'
        });
      }

      try {
        const modelInput = String(req.body?.model || 'gemini-2.5-flash-native-audio-preview-12-2025').trim();
        const model = modelInput.startsWith('models/') ? modelInput : `models/${modelInput}`;
        const systemInstruction = String(
          req.body?.systemInstruction || 'Eres un asistente pedagógico útil y amable.'
        ).trim();

        const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

        const payload = {
          authToken: {
            uses: 1,
            expireTime,
            newSessionExpireTime,
            bidiGenerateContentSetup: {
              model,
              generationConfig: {
                responseModalities: ['AUDIO']
              },
              systemInstruction: {
                parts: [{ text: systemInstruction }]
              }
            }
          }
        };

        const tokenResp = await fetch(`${GEMINI_EPHEMERAL_URL}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const tokenJson = await tokenResp.json().catch(() => ({}));

        if (!tokenResp.ok) {
          const detail = tokenJson?.error?.message || 'No se pudo crear el token efímero.';
          return res.status(tokenResp.status).json({ error: detail, raw: tokenJson });
        }

        if (!tokenJson?.name) {
          return res.status(502).json({ error: 'Respuesta de token inválida.', raw: tokenJson });
        }

        return res.json({
          token: tokenJson.name,
          model,
          expireTime: tokenJson.expireTime || expireTime,
          newSessionExpireTime: tokenJson.newSessionExpireTime || newSessionExpireTime
        });
      } catch (err) {
        return res.status(500).json({
          error: err?.message || 'Error interno al crear token efímero.'
        });
      }
    });

    server = expressApp.listen(3000, () => {
      console.log('🌐 Servidor local en http://localhost:3000');
      resolve();
    });

    server.on('error', (err) => {
      console.error('❌ Error iniciando servidor Express:', err);
      reject(err);
    });
  });
}

async function createWindow() {
  // Primero levanta el servidor
  await createServer();

  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,   // Firebase como en navegador
      contextIsolation: true
    }
  });

  // 👉 En vez de loadFile, cargamos la URL
  win.loadURL('http://localhost:3000/index.html');

  win.on('closed', () => {
    // Opcional: si quieres cerrar el server cuando se cierre la ventana
    if (server) {
      server.close();
      server = null;
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (server) {
    server.close();
    server = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
