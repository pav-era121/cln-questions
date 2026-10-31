const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
let code = fs.readFileSync(appJsPath, 'utf8');

const target1 = '<h3 class="course-title">${c.name}</h3>';
const badgeCode = '${c.is_private === 1 ? `<div style="margin-bottom:6px;"><span style="background:rgba(124, 58, 237, 0.12); color:#7c3aed; border:1px solid rgba(124, 58, 237, 0.3); font-size:0.72rem; padding:3px 8px; border-radius:999px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">🔒 Private (Admin Only)</span></div>` : \'\'}\n          <h3 class="course-title">${c.name}</h3>';

let count = 0;
const parts = code.split(target1);
if (parts.length >= 3) {
  // Rejoin with badgeCode for first 2, and target1 for remaining
  code = parts[0] + badgeCode + parts[1] + badgeCode + parts.slice(2).join(target1);
  console.log('Replaced target1 in 2 places');
} else {
  console.log('Target1 occurrences:', parts.length - 1);
}

const target2 = '<span class="brand-badge">FRESHMAN COURSE</span>';
const repl2 = '<span class="brand-badge" style="${c.is_private === 1 ? \'background:#7c3aed; color:#fff;\' : \'\'}">${c.is_private === 1 ? \'🔒 PRIVATE ADVANCED COURSE • MEng 31xx\' : \'FRESHMAN COURSE\'}</span>';

if (code.includes(target2)) {
  code = code.replace(target2, repl2);
  console.log('Replaced target2');
} else {
  console.log('target2 not found');
}

fs.writeFileSync(appJsPath, code, 'utf8');
console.log('app.js successfully updated with private badges!');
