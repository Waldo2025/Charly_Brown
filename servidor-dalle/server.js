
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { generarImagenDesdeSpec } = require("./apiGoogle");

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/generar-imagen', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Falta el prompt" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,

    "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024"
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Error generando imagen");
    console.log("Respuesta OpenAI:", data);


    res.json({ imageUrl: data.data[0].url });

  } catch (error) {
    console.error("Error al generar imagen:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
