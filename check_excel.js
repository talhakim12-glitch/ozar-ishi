const XLSX = require('xlsx');
const wb = XLSX.readFile(process.argv[2]);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log('עמודות:', JSON.stringify(Object.keys(data[0])));
console.log('דוגמאות:');
data.filter(r => r['סטטוס'] === 'הופק' && r['שם לקוח'] && r['שם לקוח'] !== 'שם לקוח').slice(0, 3).forEach(r => console.log(JSON.stringify(r)));
