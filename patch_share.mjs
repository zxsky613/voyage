import { readFileSync, writeFileSync } from 'fs';

const src = readFileSync('App.jsx', 'utf8');
const newCode = readFileSync('temp_share_modal.jsx', 'utf8');

// Find "function ShareModal(" line
const lines = src.split('\n');
let startLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('function ShareModal(')) { startLine = i; break; }
}
if (startLine === -1) { console.error('Not found'); process.exit(1); }

// Find the closing } of the function body by counting braces,
// but skip the parameter destructuring { } on the first line
let depth = 0;
let endLine = -1;
let bodyStarted = false;

for (let i = startLine; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '{') {
      depth++;
      if (depth === 1 && i === startLine) {
        // This is the destructuring { in the params — skip it
        // Find matching } on same line
        let inner = 1;
        j++;
        while (j < line.length && inner > 0) {
          if (line[j] === '{') inner++;
          else if (line[j] === '}') inner--;
          j++;
        }
        j--; // back up
        depth--; // undo the depth++ from the params {
      } else {
        bodyStarted = true;
      }
    } else if (ch === '}') {
      if (bodyStarted) {
        depth--;
        if (depth === 0) { endLine = i; break; }
      }
    }
  }
  if (endLine !== -1) break;
}

console.log(`ShareModal: lines ${startLine+1} to ${endLine+1}`);

const before = lines.slice(0, startLine).join('\n');
const after = lines.slice(endLine + 1).join('\n');
const result = before + '\n' + newCode.trim() + '\n' + after;
writeFileSync('App.jsx', result, 'utf8');
console.log(`Done. Lines: ${result.split('\n').length}`);
