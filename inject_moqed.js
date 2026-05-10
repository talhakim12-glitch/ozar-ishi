const fs = require('fs');
const XLSX = require('xlsx');

const htmlPath = './public/index.html';
const xlFile = process.argv[2];

const wb = XLSX.readFile(xlFile);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

const moqedPolicies = data
  .filter(r => r['סטטוס'] === 'הופק' && r['שם לקוח'] && r['שם לקוח'] !== 'שם לקוח')
  .map(r => ({
    client: String(r['שם לקוח']).trim(),
    date:   String(r['תאריך הפקה'] || '').trim(),
    company: String(r['חברה מבטחת'] || '').trim(),
    ins_type: String(r['סוג ביטוח'] || '').trim(),
    premium: Math.round(parseFloat(r['פרמיה '] || r['פרמיה'] || 0)),
    one_time: Math.round(parseFloat(r['עמלת היקף'] || 0) * 100) / 100,
    monthly: Math.round(parseFloat(r['נפרעים'] || 0) * 100) / 100,
    employer: 'tal'
  }))
  .filter(p => p.premium > 0);

// Read existing POLICIES from HTML
let html = fs.readFileSync(htmlPath, 'utf8');

// Extract existing TAL policies from the concat block to find duplicates
const concatMatch = html.match(/\.concat\(\[([\s\S]*?)\]\);/);
let existingTal = [];
if (concatMatch) {
  try { existingTal = JSON.parse('[' + concatMatch[1] + ']'); } catch(e) {}
}

// For each moqed policy: if duplicate exists with monthly=0 → update it; else add new
let updated = 0, added = 0;
const newPolicies = [];

moqedPolicies.forEach(mp => {
  const dupIdx = existingTal.findIndex(p =>
    p.client === mp.client &&
    p.date === mp.date &&
    p.company === mp.company &&
    p.ins_type.trim() === mp.ins_type.trim()
  );
  if (dupIdx >= 0) {
    if (!existingTal[dupIdx].monthly && mp.monthly) {
      existingTal[dupIdx].monthly = mp.monthly;
      updated++;
    }
  } else {
    newPolicies.push(mp);
    added++;
  }
});

console.log('עודכנו (monthly הוסף):', updated);
console.log('פוליסות חדשות:', added);

// Rebuild the concat block with updated + new policies
const allTal = [...existingTal, ...newPolicies];
const talJSON = allTal.map(p => JSON.stringify(p)).join(',');
html = html.replace(/\.concat\(\[[\s\S]*?\]\);/, `.concat([${talJSON}]);`);

fs.writeFileSync(htmlPath, html, 'utf8');

// Verify
const talCount = (html.match(/"employer":"tal"/g)||[]).length;
const totalMonthly = allTal.reduce((s,p) => s+(p.monthly||0), 0);
console.log('סה"כ פוליסות TAL:', talCount);
console.log('סה"כ נפרעים חדש:', Math.round(totalMonthly));
