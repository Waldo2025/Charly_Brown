
// 🔹 **API Key interna para Google Gemini (No se muestra en la interfaz)**
const googleAPIKey = "AIzaSyA-Al10Diw6CkowW0F3EePEBD6D1h3jwxw";
const googleAPIEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const fetch = require("node-fetch");

async function generarImagenDesdeSpec(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      quality: "hd",
      n: 1,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Error al generar imagen");
  return data.data[0]?.url;
}

module.exports = { generarImagenDesdeSpec };