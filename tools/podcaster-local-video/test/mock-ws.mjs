// WebSocket mínimo para los mocks de ComfyUI: basta el abrazo RFC6455 y frames de
// texto sin máscara (servidor→cliente). ComfyUI solo publica por /ws el avance real
// por paso, que es lo que el daemon quiere reenviar a la consola y al sitio.
import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function textFrame(payload) {
  const body = Buffer.from(payload, "utf8");
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }
  const head = Buffer.alloc(4);
  head[0] = 0x81;
  head[1] = 126;
  head.writeUInt16BE(body.length, 2);
  return Buffer.concat([head, body]);
}

/**
 * Devuelve un emisor de avances. `runSteps(promptId, { max, everyMs })` imita lo que
 * ComfyUI manda mientras muestrea, y para solo cuando el prompt se completa o el
 * socket se cae (nada de temporizadores colgados al terminar la prueba).
 */
export function attachProgressSocket(server) {
  const sockets = new Set();
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const key = req.headers["sec-websocket-key"];
    if (url.pathname !== "/ws" || !key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    // El cliente solo habla al cerrar: cualquier frame entrante es despedida.
    socket.on("data", () => { sockets.delete(socket); socket.end(); });
    socket.on("error", () => sockets.delete(socket));
    socket.on("close", () => sockets.delete(socket));
  });
  const send = (payload) => {
    for (const socket of sockets) {
      try {
        socket.write(textFrame(JSON.stringify(payload)));
      } catch {
        sockets.delete(socket);
      }
    }
  };
  return {
    clients: () => sockets.size,
    progress(promptId, value, max) {
      send({ type: "progress", data: { value, max, prompt_id: promptId } });
    },
    finished(promptId) {
      send({ type: "executing", data: { node: null, prompt_id: promptId } });
    },
    runSteps(promptId, { max = 8, everyMs = 700, steps = null } = {}) {
      const total = Number(steps) || max;
      let value = 0;
      const timer = setInterval(() => {
        if (!sockets.size || value >= total) {
          clearInterval(timer);
          return;
        }
        value += 1;
        send({ type: "progress", data: { value, max: total, prompt_id: promptId } });
        if (value >= total) clearInterval(timer);
      }, everyMs);
      timer.unref?.();
      return () => clearInterval(timer);
    },
  };
}
