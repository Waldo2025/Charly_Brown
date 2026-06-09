const fs = require("fs");
const path = require("path");

// Read GEMINI_API_KEY from .env
const envPath = path.resolve(__dirname, "..", ".env");
const envContent = fs.readFileSync(envPath, "utf8");
const keyMatch = envContent.match(/GEMINI_API_KEY="([^"]+)"/);
const apiKey = keyMatch ? keyMatch[1] : "";

if (!apiKey) {
  console.error("No API key found in .env");
  process.exit(1);
}

const payload = {
  contents: [{ role: "user", parts: [{ text: "Please read this line: Hello world test." }] }],
  generationConfig: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: "Puck"
        }
      }
    }
  }
};

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${encodeURIComponent(apiKey)}`;

async function run() {
  console.log("Calling Gemini API...");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log("Response status:", res.status);
  
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    console.log("Response candidate parts keys:");
    data.candidates[0].content.parts.forEach((part, i) => {
      console.log(`Part ${i}:`, Object.keys(part));
      if (part.audioMetadata) {
        console.log(`Part ${i} audioMetadata:`, JSON.stringify(part.audioMetadata, null, 2));
      }
      if (part.metadata) {
        console.log(`Part ${i} metadata:`, JSON.stringify(part.metadata, null, 2));
      }
      if (part.alignment) {
        console.log(`Part ${i} alignment:`, JSON.stringify(part.alignment, null, 2));
      }
    });
  } else {
    console.log("Response JSON:");
    console.log(JSON.stringify(data, null, 2));
  }
}

run().catch(err => {
  console.error("Error:", err);
});
