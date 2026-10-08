const fs = require('node:fs');
const source = fs.readFileSync('functions/src/mcp/runtime.js', 'utf8');
fs.writeFileSync('backend/sally/mcp-runtime.generated.js', '// Generated from functions/src/mcp/runtime.js; do not edit.\n' + source);
