const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  generarImagen: (prompt, model) =>
    ipcRenderer.invoke("generar-imagen", { prompt, model }),
});
