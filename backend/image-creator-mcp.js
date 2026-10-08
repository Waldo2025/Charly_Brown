const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const z = require("zod/v4");

function createServer(context) {
  const server = new McpServer({
    name: "image-creator-mcp",
    version: "1.0.0"
  });

  // Tool 1: draft_video_script
  server.tool(
    "draft_video_script",
    "Genera o estructura un guion de video educativo con las columnas requeridas para Podcaster (tiempo, guion, descripción de escena, texto en pantalla, transición, elemento visual). Cada escena debe durar 8 segundos y tener un hook detonante.",
    {
      topic: z.string().describe("El tema o instrucción para el guion de video"),
      scenes: z.array(z.object({
        tiempo: z.string().default("8 segundos"),
        guion: z.string().describe("Voz en off con pregunta detonante o frase hook"),
        descripcion_escena: z.string().describe("Descripción visual detallada de la escena"),
        texto_pantalla: z.string().describe("Títulos, palabras clave o frases de apoyo"),
        transicion: z.string().default("Corte").describe("Tipo de transición"),
        elemento_visual: z.string().describe("Acción que se realiza en la escena")
      })).optional().describe("Lista de escenas estructuradas si ya existen")
    },
    async ({ topic, scenes }) => {
      if (scenes && scenes.length > 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ status: "success", scenes })
          }]
        };
      }
      
      const prompt = `Actúa como un experto en creación de contenido audiovisual y guionista educativo.
Crea un guion estructurado para un video corto sobre: "${topic}".
Cada escena debe durar exactamente 8 segundos.
El guion (voz en off) debe comenzar preferentemente con una pregunta detonante o frase hook atractiva.
Devuelve un JSON con un array llamado "scenes", donde cada escena tenga:
- tiempo: "8 segundos"
- guion: voz en off
- descripcion_escena: descripción detallada de lo que se ve
- texto_pantalla: texto que aparece en pantalla
- transicion: tipo de transición
- elemento_visual: acción principal en la escena`;

      const response = await context.generateText({
        prompt,
        json: true
      });

      return {
        content: [{
          type: "text",
          text: response
        }]
      };
    }
  );

  // Tool 2: configure_image_style
  server.tool(
    "configure_image_style",
    "Configura el estilo visual general para las imágenes de referencia del guion.",
    {
      style: z.enum(["realista", "animacion_3d", "caricatura_moderna", "stick_draw", "cinematico", "otro"]),
      customStyle: z.string().optional().describe("Descripción del estilo si se seleccionó 'otro'")
    },
    async ({ style, customStyle }) => {
      const selectedStyle = style === "otro" ? customStyle : style;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "configured",
            style: selectedStyle
          })
        }]
      };
    }
  );

  // Tool 3: generate_scene_image_prompt
  server.tool(
    "generate_scene_image_prompt",
    "Genera un prompt detallado en inglés optimizado para crear una imagen de referencia con la API de generación a partir de una escena y estilo.",
    {
      sceneDescription: z.string().describe("Descripción de la escena"),
      style: z.string().describe("Estilo visual seleccionado")
    },
    async ({ sceneDescription, style }) => {
      const prompt = `Translate and enhance the following scene description into an optimal English text-to-image prompt.
Scene: "${sceneDescription}"
Style: "${style}"
Return ONLY the raw prompt string, detailed and cinematic, without preambles or quotes.`;

      const response = await context.generateText({
        prompt
      });

      return {
        content: [{
          type: "text",
          text: response.trim()
        }]
      };
    }
  );

  return server;
}

function registerImageCreatorMcpRoutes(app, dependencies) {
  app.post("/api/image-creator/agent", async (req, res) => {
    try {
      const auth = await dependencies.verifyFirebaseBearer(req);
      const { message, history = [], currentScenes = [] } = req.body;

      const systemInstruction = `Eres un Asistente Creativo experto y Agente MCP para Image Creator.
Tu objetivo principal es ayudar al usuario a crear o estructurar guiones de video para Podcaster y preparar sus imágenes de referencia.
El formato requerido para cada escena de Podcaster consta estrictamente de:
1. Tiempo (8 segundos por escena)
2. Guion (voz en off, iniciando con una pregunta detonante o hook atractivo)
3. Descripción de escena (muy detallada)
4. Texto en pantalla (títulos, frases de apoyo, palabras clave)
5. Transición (ej. Corte, Fundido, Desplazamiento)
6. Elemento visual (la acción que ocurre en escena)

Si el usuario te da un tema o te pide un guion, proporciónalo siempre en una tabla clara o bloque JSON estructurado con estas columnas exactas para que el usuario pueda revisarlo.
Sé proactivo, creativo y conciso.`;

      const fullPrompt = `${systemInstruction}\n\nHistorial:\n${JSON.stringify(history)}\n\nUsuario: ${message}`;
      
      const response = await dependencies.generateText({
        prompt: fullPrompt
      });

      res.json({
        reply: response
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = {
  createServer,
  registerImageCreatorMcpRoutes
};
