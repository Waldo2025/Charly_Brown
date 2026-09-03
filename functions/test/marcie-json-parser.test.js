const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

async function loadParser() {
  const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-json.js"), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("repara comas finales de Gemini sin alterar el contenido de las cadenas", async () => {
  const { parseMarcieJson } = await loadParser();
  const parsed = parseMarcieJson(`\`\`\`json
  {
    "blocks": [
      { "id": "b3", "text": "El texto conserva una coma, }", },
    ],
    "seo": { "keywords": ["aprendizaje",], },
  }
  \`\`\``);

  assert.equal(parsed.blocks[0].text, "El texto conserva una coma, }");
  assert.deepEqual(parsed.seo.keywords, ["aprendizaje"]);
});

test("sigue rechazando respuestas que no pueden convertirse en JSON", async () => {
  const { parseMarcieJson } = await loadParser();
  assert.throws(() => parseMarcieJson('{"blocks":[{"id":"b1"}'), SyntaxError);
});
