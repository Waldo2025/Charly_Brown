const fs = require('fs');
const lines = fs.readFileSync('public/podcaster/podcaster.js', 'utf8').split('\n');
let balance = 0;
lines.forEach((line, i) => {
    let local = 0;
    for (let char of line) {
        if (char === '(') { local++; balance++; }
        if (char === ')') { local--; balance--; }
    }
    if (balance < -100) { // arbitrary threshold to find the drop
        // console.log(`Balance dropped at line ${i + 1}: ${balance}`);
    }
});
console.log('Final balance:', balance);
