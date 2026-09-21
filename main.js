require('electron-reload')(__dirname, {
  electron: require(`${__dirname}/node_modules/electron`)
});

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const { createSallyBrownController } = require('./electron/sally-brown-controller.js');

let server; // Para poder cerrarlo al salir
let sallyController;

const SALLY_COMMANDS = Object.freeze({
  availability: 'availability',
  start: 'start',
  close: 'close',
  navigate: 'navigate',
  input: 'input',
  inspect: 'inspect',
  selection: 'selection',
  approve: 'approve',
  execute: 'execute',
  control: 'control'
});

function registerSallyBrownIpc(win) {
  sallyController = createSallyBrownController({
    sendEvent(event) {
      if (!win.isDestroyed()) win.webContents.send('sally-brown:event', event);
    }
  });
  ipcMain.removeHandler('sally-brown:invoke');
  ipcMain.handle('sally-brown:invoke', async (event, request = {}) => {
    if (event.sender !== win.webContents) throw new Error('Origen IPC no autorizado.');
    const command = String(request.command || '');
    const method = SALLY_COMMANDS[command];
    if (!method || typeof sallyController[method] !== 'function') throw new Error('Comando Sally Brown no permitido.');
    if (command === 'availability') return sallyController.availability();
    const actor = await sallyController.authorize(request.idToken);
    return sallyController[method](request.payload && typeof request.payload === 'object' ? request.payload : {}, actor);
  });
}

async function createServer() {
  return new Promise((resolve, reject) => {
    const expressApp = express();
    const publicPath = path.join(__dirname, 'public');
    const GEMINI_EPHEMERAL_URL = 'https://generativelanguage.googleapis.com/v1beta/authTokens';

    // La aplicación de escritorio siempre debe leer la revisión actual del disco.
    expressApp.use(express.json({ limit: '1mb' }));
    expressApp.use(express.static(publicPath, {
      etag: false,
      lastModified: false,
      maxAge: 0,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
      }
    }));

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
    width: 1440,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,   // Firebase como en navegador
      contextIsolation: true
    }
  });

  registerSallyBrownIpc(win);

  // 👉 En vez de loadFile, cargamos la URL
  win.loadURL('http://localhost:3000/index.html' + (process.argv.includes('--sally') ? '?next=SallyBrownEditor.html' : ''));

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
