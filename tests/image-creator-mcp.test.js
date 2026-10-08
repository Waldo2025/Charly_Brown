const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../backend/image-creator-mcp.js");

test("Image Creator MCP Server registers tools correctly", async () => {
  const fakeContext = {
    generateText: async ({ prompt }) => {
      if (prompt.includes("Translate and enhance")) {
        return "A cinematic wide shot of a futuristic classroom with neon lights.";
      }
      return JSON.stringify({
        scenes: [
          {
            tiempo: "8 segundos",
            guion: "¿Alguna vez te has preguntado cómo viaja la luz?",
            descripcion_escena: "Un haz de luz atraviesa un prisma.",
            texto_pantalla: "La velocidad de la luz",
            transicion: "Fundido",
            elemento_visual: "El prisma refracta los colores del arcoíris."
          }
        ]
      });
    }
  };

  const server = createServer(fakeContext);
  assert.ok(server);
  assert.equal(server.server._instructions === undefined, true);
});
