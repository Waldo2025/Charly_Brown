import assert from "node:assert/strict";
import test from "node:test";

import { resolveAcademicSubjectOptions } from "../public/podcaster/podcaster-academic-metadata.js";
import { createPodcasterSessionRailApi } from "../public/podcaster/podcaster-session-rail.js";

class FakeSelect {
  constructor() {
    this.options = [""];
    this._value = "";
    this.attributes = {};
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    const normalized = String(nextValue || "");
    this._value = this.options.includes(normalized) ? normalized : "";
  }

  set innerHTML(markup) {
    this.options = Array.from(markup.matchAll(/<option value="([^"]*)">/g), (match) => match[1]);
    this._value = this.options[0] || "";
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

test("rehidrata la materia después de crear las opciones del select", () => {
  const subjectSelect = new FakeSelect();
  const subjectField = { hidden: true };
  const subjectLabel = { textContent: "" };
  const api = createPodcasterSessionRailApi({
    state: {},
    els: {
      sessionAcademicSubjectField: subjectField,
      sessionAcademicSubjectLabel: subjectLabel,
      sessionAcademicSubjectSelect: subjectSelect
    },
    escapeHtml: (value) => String(value),
    resolveAcademicSubjectOptions
  });

  api.syncSessionAcademicSubjectUi({
    nivel: "Secundaria",
    grado: "Segundo",
    materia: "Física"
  });

  assert.equal(subjectField.hidden, false);
  assert.equal(subjectLabel.textContent, "Materia");
  assert.ok(subjectSelect.options.includes("Física"));
  assert.equal(subjectSelect.value, "Física");
});
