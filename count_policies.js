const fs = require('fs'), path = require('path');
const DIR = 'C:\\Users\\USER\\Desktop\\ביטוח לקוחות';
const strict = ['פוליסה','פוליסת','נוסח פוליסה','policy'];
let total = 0, strict_count = 0;
const examples = [];
fs.readdirSync(DIR).forEach(function(client) {
  const dir = path.join(DIR, client);
  try {
    fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).forEach(function(f) {
      total++;
      const low = f.toLowerCase();
      if (strict.some(w => low.includes(w))) {
        strict_count++;
        if (examples.length < 5) examples.push(client + ' / ' + f);
      }
    });
  } catch(e) {}
});
console.log('סה"כ PDFs:', total);
console.log('קבצי פוליסה (מצומצם):', strict_count);
console.log('דוגמאות:');
examples.forEach(e => console.log(' -', e));
