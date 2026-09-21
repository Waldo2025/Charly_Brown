const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  generarImagen: (prompt, model) =>
    ipcRenderer.invoke("generar-imagen", { prompt, model }),
});

const SALLY_COMMANDS = new Set([
  "availability", "start", "close", "navigate", "input", "inspect", "selection", "approve", "execute", "control"
]);

contextBridge.exposeInMainWorld("sallyBrown", {
  invoke: (command, idToken = "", payload = {}) => {
    if (!SALLY_COMMANDS.has(command)) return Promise.reject(new Error("Comando Sally Brown no permitido."));
    return ipcRenderer.invoke("sally-brown:invoke", { command, idToken, payload });
  },
  onEvent: (listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, message) => listener(message);
    ipcRenderer.on("sally-brown:event", wrapped);
    return () => ipcRenderer.removeListener("sally-brown:event", wrapped);
  }
});
