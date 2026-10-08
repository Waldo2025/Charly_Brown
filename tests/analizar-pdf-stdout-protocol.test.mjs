import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('PDF library diagnostics cannot contaminate the JSON result', () => {
  const result = spawnSync('python3', ['-c', `
import os, runpy, sys, types
class Tools:
    def mupdf_display_warnings(self, enabled): pass
    def mupdf_display_errors(self, enabled): pass
    def mupdf_warnings(self): return 'repaired cross-reference table'
class Document:
    def __enter__(self):
        os.write(1, b'warning: native library diagnostic\\n')
        print('warning: Python diagnostic')
        return self
    def __exit__(self, *args): pass
    def __len__(self): return 1
sys.modules['fitz'] = types.SimpleNamespace(TOOLS=Tools(), open=lambda path: Document())
sys.modules['analizar_pdf'] = types.ModuleType('analizar_pdf')
sys.modules['analizar_pdf.pipeline'] = types.SimpleNamespace(analyze_document=lambda doc, session: {'stats': {'pageCount': 1, 'durationMs': 0}})
sys.modules['analizar_pdf.spelling'] = types.SimpleNamespace(find_spelling_issues=lambda *args: [])
sys.modules['analizar_pdf.utils'] = types.SimpleNamespace(debug_log=lambda *args, **kwargs: None)
sys.argv = ['analyze_pdf.py', '--input', 'fixture.pdf', '--session-json', '{}']
runpy.run_path('backend/python/analyze_pdf.py', run_name='__main__')
`], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).stats.pageCount, 1);
  assert.match(result.stderr, /native library diagnostic/);
  assert.match(result.stderr, /Python diagnostic/);
  assert.match(result.stderr, /repaired cross-reference/);
});
