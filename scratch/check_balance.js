const fs = require('fs');
const content = fs.readFileSync('public/podcaster/podcaster.js', 'utf8');
let parens = 0;
let braces = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '(') parens++;
    if (content[i] === ')') parens--;
    if (content[i] === '{') braces++;
    if (content[i] === '}') braces--;
}
console.log('Parens balance:', parens);
console.log('Braces balance:', braces);
