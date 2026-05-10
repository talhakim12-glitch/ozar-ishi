const fs = require('fs');
const XLSX = require('xlsx');

const htmlPath = './public/index.html';
const xlFile = process.argv[2];

const wb = XLSX.readFile(xlFile);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '', range: 1 });

const abaPolicies = data
  .filter(r => r['סטטוס'] === 'הופק' && r['שם לקוח'])
  .map(r => ({
    client:   String(r['שם לקוח']).trim(),
    date:     String(r['תאריך הפקה'] || '').trim(),
    company:  String(r['חברה מבטחת'] || '').trim(),
    ins_type: String(r['סוג ביטוח'] || '').trim(),
    premium:  Math.round(parseFloat(r['פרמיה'] || 0)),
    one_time: Math.round(parseFloat(r['עמלת היקף'] || 0) * 100) / 100,
    monthly:  Math.round(parseFloat(r['נפרעים'] || 0) * 100) / 100,
    employer: 'aba'
  }))
  .filter(p => p.premium > 0);

console.log('פוליסות אבא ואילן שנמצאו:', abaPolicies.length);

let html = fs.readFileSync(htmlPath, 'utf8');

// Look for existing ABA concat block
const abaMatch = html.match(/\.concat\(\[([\s\S]*?)\]\)\.concat\(\[/);

// Check if there's already an ABA block (employer:aba)
const hasAba = html.includes('"employer":"aba"');

if (hasAba) {
  // Update existing ABA block
  const abaBlockMatch = html.match(/\/\*ABA\*\/\.concat\(\[([\s\S]*?)\]\)/);
  if (abaBlockMatch) {
    const abaJSON = abaPolicies.map(p => JSON.stringify(p)).join(',');
    html = html.replace(/\/\*ABA\*\/\.concat\(\[[\s\S]*?\]\)/, '/*ABA*/.concat([' + abaJSON + '])');
    console.log('עדכן בלוק ABA קיים');
  }
} else {
  // Add new ABA concat block after the last .concat([...]);
  // Find the last occurrence of .concat([...]) that ends with });
  const talConcatEnd = /\.concat\(\[[\s\S]*?\]\);/;
  const match = html.match(talConcatEnd);
  if (!match) {
    console.error('לא נמצא בלוק concat קיים');
    process.exit(1);
  }
  // Find last occurrence
  let lastIdx = -1;
  let searchStr = html;
  const regex = /\.concat\(\[[\s\S]*?\]\);/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    lastIdx = m.index;
  }
  if (lastIdx === -1) {
    console.error('לא נמצא בלוק concat');
    process.exit(1);
  }
  // Get the matched string
  const concatRegex = /\.concat\(\[[\s\S]*?\]\);/g;
  concatRegex.lastIndex = lastIdx;
  const lastMatch = concatRegex.exec(html);
  if (!lastMatch) {
    console.error('שגיאה במציאת concat');
    process.exit(1);
  }
  const abaJSON = abaPolicies.map(p => JSON.stringify(p)).join(',');
  const newBlock = lastMatch[0].slice(0, -1) + '/*ABA*/.concat([' + abaJSON + ']);';
  html = html.slice(0, lastMatch.index) + newBlock + html.slice(lastMatch.index + lastMatch[0].length);
  console.log('נוסף בלוק ABA חדש');
}

fs.writeFileSync(htmlPath, html, 'utf8');

const abaCount = (html.match(/"employer":"aba"/g) || []).length;
console.log('סה"כ פוליסות ABA:', abaCount);
