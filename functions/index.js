const {onCall, HttpsError} = require("firebase-functions/v2/https");
const fetch = require("node-fetch");

exports.generarImagen = onCall(async (data, context) => {
  const prompt = data.prompt;
  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/images/generations", {method: "POST", headers: {"Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`}, body: JSON.stringify({model: "dall-e-3", prompt: prompt, size: "1024x1024", quality: "hd", n: 1})});

  const dataResponse = await response.json();

  if (!response.ok) {
    const errorMessage = (dataResponse &&
      dataResponse.error &&
      dataResponse.error.message) || "Error generando imagen";
    throw new HttpsError("internal", errorMessage);
  }

  return {imageUrl: dataResponse.data[0].url};
});
