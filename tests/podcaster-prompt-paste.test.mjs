import assert from "node:assert/strict";
import { createPodcasterPromptComposerApi } from "../public/podcaster/podcaster-prompt-composer.js";

const state = {
  autoResizeCalls: 0,
  insertHtmlCalls: 0,
  preventDefaultCalls: 0
};

globalThis.window = {
  clipboardData: null,
  setTimeout(fn) {
    state.autoResizeCalls += 1;
    if (typeof fn === "function") fn();
    return 1;
  }
};

const api = createPodcasterPromptComposerApi({
  els: {
    promptInput: {
      style: {},
      scrollHeight: 48,
      focus() {}
    }
  },
  escapeHtml: (value = "") => String(value || ""),
  parseHtmlTableToRows() {
    return [["Tiempo", "Guion"], ["0:00", "Texto"]];
  },
  parsePlainTextTableToRows() {
    return [];
  },
  buildHtmlTableFromRows() {
    return "<table><tr><td>rebuild</td></tr></table>";
  }
});

api.insertHtml = () => {
  state.insertHtmlCalls += 1;
};

const event = {
  clipboardData: {
    getData(type) {
      if (type === "text/html") {
        return "<tr><td><strong>Con estilo</strong></td><td>Otro valor</td></tr>";
      }
      return "";
    }
  },
  preventDefault() {
    state.preventDefaultCalls += 1;
  }
};

api.handlePaste(event);

assert.equal(state.preventDefaultCalls, 0, "No debe interceptar fragmentos HTML de tabla; debe dejar el pegado nativo");
assert.equal(state.insertHtmlCalls, 0, "No debe reconstruir la tabla cuando ya viene como HTML rico");
assert.ok(state.autoResizeCalls >= 1, "Debe reajustar altura tras el pegado nativo");

console.log("ok - podcaster prompt paste preserves rich table html");
