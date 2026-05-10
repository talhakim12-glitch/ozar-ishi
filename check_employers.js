const fs = require('fs');
const html = fs.readFileSync('./public/index.html', 'utf8');
const re = /"employer":"([^"]+)"/g;
const counts = {};
let m;
while((m = re.exec(html)) !== null) {
  counts[m[1]] = (counts[m[1]] || 0) + 1;
}
console.log('Employer values:', JSON.stringify(counts, null, 2));
