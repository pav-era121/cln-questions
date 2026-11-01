const fs = require('fs');
const path = require('path');

const enginePath = path.join(__dirname, '..', 'arenaEngine.js');
let s = fs.readFileSync(enginePath, 'utf8');

const target1 = `    let questionIds = [];
    if (rows && rows.length >= 25) {
      const indices = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 49];
      questionIds = indices.map(i => rows[i].id);
    } else {
      questionIds = rows.map(r => r.id);
    }`;

const repl1 = `    let questionIds = [];
    if (rows && rows.length >= 40) {
      const dropIndices = new Set([1, 7, 10, 12, 17, 23, 25, 27, 32, 39]);
      questionIds = rows.filter((r, i) => !dropIndices.has(i)).map(r => r.id);
    } else {
      questionIds = rows.map(r => r.id);
    }`;

s = s.replace(target1, repl1);
s = s.replace(
  "SET title = 'Sunday Grand Arena: Geography Chapter 2 (The Geology of Ethiopia & Horn)'",
  "SET title = 'Sunday Grand Arena: Geography Chapter 2 (40 Questions)'"
);

fs.writeFileSync(enginePath, s, 'utf8');
console.log('✅ arenaEngine.js successfully updated to 40 questions!');
