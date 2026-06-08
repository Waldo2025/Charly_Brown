import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const probe = spawnSync(
  "python3",
  [
    "-c",
    [
      "import json",
      "from backend.python.analizar_idml.spelling import _is_valid_spelling_match",
      "payload = {'missing_accent': _is_valid_spelling_match('Soy minusculo', 'minusculo', 'minúsculo'), 'already_accented_false_positive': _is_valid_spelling_match('Soy minúsculo', 'minúsculo', 'mínusculo'), 'already_accented_same_word': _is_valid_spelling_match('Soy minúsculo', 'minúsculo', 'minúsculo')}",
      "print(json.dumps(payload))",
    ].join('; '),
  ],
  { encoding: "utf8" },
);

assert.equal(probe.status, 0, probe.stderr);
const payload = JSON.parse(probe.stdout);

assert.equal(payload.missing_accent, true, "Debe aceptar correcciones reales de tilde faltante.");
assert.equal(payload.already_accented_false_positive, false, "Debe rechazar falsos positivos cuando la palabra ya trae tilde.");
assert.equal(payload.already_accented_same_word, false, "No debe aceptar sugerencias idénticas.");

const nestedTableProbe = spawnSync(
  "python3",
  [
    "-c",
    [
      "from backend.python.analizar_idml.pipeline import analyze_idml_document",
      "session={'id':'nested-table','sourceType':'idml','bibliographicInfo':{'grado':'Primero','unidad':'Proyecto','nivel':'Primaria','bookType':'LA'},'analysisMapping':{'entries':[{'alias':'instruccion','styleKind':'paragraph','styleName':'INSTRUCCION','enabled':True},{'alias':'texto','styleKind':'paragraph','styleName':'TEXTO','enabled':True}]}}",
      "res=analyze_idml_document('public/analizarPDF/EEFESPPRI_10REV_TRIM1_P2_LA_02_U1.idml',session)",
      "page=next((p for p in res['stats']['pageReports'] if str(p.get('pageName'))=='37'), None)",
      "instruction_texts=[str(item.get('text') or '') for item in (page.get('content') or {}).get('instrucciones', []) if str(item.get('storyId') or '')=='u14c9']",
      "table_texts=[str(item.get('text') or '') for item in (page.get('content') or {}).get('párrafos normales', []) if str(item.get('storyId') or '')=='u14c9']",
      "assert all('Soy minúsculo' not in text for text in instruction_texts)",
      "assert any(text=='Soy minúsculo' for text in table_texts)",
      "print('ok')",
    ].join('; '),
  ],
  { encoding: "utf8" },
);

assert.equal(nestedTableProbe.status, 0, nestedTableProbe.stderr);

console.log("Analizar IDML spelling filter regression OK.");
