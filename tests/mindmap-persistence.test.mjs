import test from "node:test";
import assert from "node:assert/strict";

import {
  limpiarDatosFirestore,
  normalizarFuenteImagenPersistente,
  resolverLecturaMindmap
} from "../public/js/mindmapPersistence.mjs";

test("restaura los campos actuales de lectura", () => {
  assert.deepEqual(resolverLecturaMindmap({
    textoParte1: "Lectura izquierda.",
    textoParte2: "Lectura derecha."
  }), {
    textoParte1: "Lectura izquierda.",
    textoParte2: "Lectura derecha."
  });
});

test("acepta aliases heredados y nunca conserva una lectura anterior", () => {
  assert.deepEqual(resolverLecturaMindmap({ parte1: "Primera.", parte2: "Segunda." }), {
    textoParte1: "Primera.",
    textoParte2: "Segunda."
  });
  assert.deepEqual(resolverLecturaMindmap({}), { textoParte1: "", textoParte2: "" });
});

test("reconstruye la lectura desde el contenido guardado cuando faltan los textos", () => {
  const lectura = resolverLecturaMindmap({
    contenido: [
      { palabra: "Hola", pageIndex: "0", blockIndex: "0", wordIndex: "0" },
      { palabra: "mundo", pageIndex: "0", blockIndex: "0", wordIndex: "1" },
      { palabra: "Nueva", pageIndex: "1", blockIndex: "5", wordIndex: "0" },
      { palabra: "historia", pageIndex: "1", blockIndex: "5", wordIndex: "1" }
    ]
  });

  assert.deepEqual(lectura, {
    textoParte1: "Hola mundo",
    textoParte2: "Nueva historia"
  });
});

test("elimina valores undefined antes de guardar en Firestore", () => {
  const marcadorFirebase = Object.create({ tipo: "FieldValue" });
  marcadorFirebase.valor = "serverTimestamp";

  const limpio = limpiarDatosFirestore({
    nombre: "Mapa",
    omitido: undefined,
    contenido: [
      { palabra: "hola", pageIndex: undefined, src: null },
      undefined
    ],
    actualizado: marcadorFirebase
  });

  assert.deepEqual(limpio.contenido, [{ palabra: "hola", src: null }]);
  assert.equal("omitido" in limpio, false);
  assert.equal(limpio.actualizado, marcadorFirebase);
});

test("solo persiste URLs reutilizables de stickers", () => {
  assert.equal(normalizarFuenteImagenPersistente("data:image/png;base64,AAAA"), null);
  assert.equal(normalizarFuenteImagenPersistente("blob:http://localhost/sticker"), null);
  assert.equal(normalizarFuenteImagenPersistente(""), null);
  assert.equal(
    normalizarFuenteImagenPersistente("https://firebasestorage.googleapis.com/sticker.png"),
    "https://firebasestorage.googleapis.com/sticker.png"
  );
});
