const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// תיקיית לקוחות
const CLIENTS_DIR = path.join('C:\\Users\\USER\\Desktop\\ביטוח לקוחות');
if (!fs.existsSync(CLIENTS_DIR)) fs.mkdirSync(CLIENTS_DIR);

// Multer — שמירת קבצים זמנית לפני שיוך
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    // שמירת שם מקורי עם timestamp
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// ===== API ROUTES =====

// קבלת רשימת לקוחות
app.get('/api/clients', (req, res) => {
  try {
    const clients = fs.readdirSync(CLIENTS_DIR)
      .filter(f => fs.statSync(path.join(CLIENTS_DIR, f)).isDirectory())
      .map(name => {
        const dir = path.join(CLIENTS_DIR, name);
        const files = fs.readdirSync(dir).map(file => ({
          name: file,
          size: fs.statSync(path.join(dir, file)).size,
          date: fs.statSync(path.join(dir, file)).mtime
        }));
        const metaPath = path.join(dir, '_meta.json');
        const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath)) : {};
        return { name, files: files.filter(f => f.name !== '_meta.json'), meta };
      });
    res.json(clients);
  } catch (e) {
    res.json([]);
  }
});

// יצירת תיקיית לקוח
app.post('/api/clients', (req, res) => {
  const { name, id, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'שם חסר' });
  const safeName = name.replace(/[^א-תa-zA-Z0-9\s\-_.]/g, '').trim();
  const dir = path.join(CLIENTS_DIR, safeName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const meta = { name, id: id || '', phone: phone || '', created: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, '_meta.json'), JSON.stringify(meta, null, 2));
  res.json({ success: true, name: safeName });
});

// העלאת קובץ ושיוך ללקוח
app.post('/api/upload/:clientName', upload.single('file'), (req, res) => {
  const { clientName } = req.params;
  const clientDir = path.join(CLIENTS_DIR, clientName);
  if (!fs.existsSync(clientDir)) {
    fs.mkdirSync(clientDir, { recursive: true });
  }
  if (!req.file) return res.status(400).json({ error: 'קובץ חסר' });

  // העברה לתיקיית הלקוח עם שם מקורי
  const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  let destName = origName;
  let counter = 1;
  while (fs.existsSync(path.join(clientDir, destName))) {
    const ext = path.extname(origName);
    destName = path.basename(origName, ext) + '_' + counter + ext;
    counter++;
  }
  fs.renameSync(req.file.path, path.join(clientDir, destName));
  res.json({ success: true, fileName: destName });
});

// העלאת קובץ לזיהוי AI
app.post('/api/identify', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'קובץ חסר' });
  // מחזיר את הנתיב הזמני לקובץ
  res.json({ 
    success: true, 
    tmpPath: req.file.path,
    tmpName: req.file.filename,
    originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    mimetype: req.file.mimetype
  });
});

// שיוך קובץ זמני ללקוח (אחרי זיהוי AI)
app.post('/api/assign', (req, res) => {
  const { tmpName, clientName, originalName } = req.body;
  const tmpPath = path.join(__dirname, 'tmp', tmpName);
  if (!fs.existsSync(tmpPath)) return res.status(404).json({ error: 'קובץ זמני לא נמצא' });

  const clientDir = path.join(CLIENTS_DIR, clientName);
  if (!fs.existsSync(clientDir)) fs.mkdirSync(clientDir, { recursive: true });

  let destName = originalName;
  let counter = 1;
  while (fs.existsSync(path.join(clientDir, destName))) {
    const ext = path.extname(originalName);
    destName = path.basename(originalName, ext) + '_' + counter + ext;
    counter++;
  }
  fs.renameSync(tmpPath, path.join(clientDir, destName));
  res.json({ success: true, fileName: destName });
});

// מחיקת קובץ מתיקיית לקוח
app.delete('/api/clients/:clientName/files/:fileName', (req, res) => {
  const filePath = path.join(CLIENTS_DIR, req.params.clientName, req.params.fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

// הורדת קובץ
app.get('/api/clients/:clientName/files/:fileName', (req, res) => {
  const filePath = path.join(CLIENTS_DIR, req.params.clientName, req.params.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'לא נמצא' });
  res.download(filePath);
});

// חילוץ תאריך הנחה מפוליסה
app.post('/api/extract-discount/:clientName/:fileName', async (req, res) => {
  const filePath = path.join(CLIENTS_DIR, decodeURIComponent(req.params.clientName), decodeURIComponent(req.params.fileName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'קובץ לא נמצא' });

  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const cfgPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(cfgPath)) try { apiKey = JSON.parse(fs.readFileSync(cfgPath)).apiKey; } catch(e){}
  }
  if (!apiKey) return res.json({ error: 'no-key' });

  try {
    const b64 = fs.readFileSync(filePath).toString('base64');
    const today = new Date();
    const todayStr = `${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getFullYear()).slice(-2)}`;
    const prompt = `אתה עוזר לסוכן ביטוח ישראלי. היום: ${todayStr} (MM/YY).

קרא את פוליסת הביטוח ומצא:

**1. תאריך סיום ההנחה**
חפש באחת מהצורות הבאות:

פורמט מנורה/הראל — טבלת הנחות מדורגת (ההנחה יורדת עם הזמן: 65%→60%→50%...):
- כל שורה: תקופה בפורמט MM/YY-MM/YY ואחוז
- מצא את התקופה הפעילה היום (התחלה ≤ היום ≤ סיום)
- החזר את תאריך הסיום שלה בפורמט DD/MM/YYYY

פורמט כלל/בריאות — טבלת הנחות לכיסויים:
- כותרת: "טבלת עלויות חודשיות בש"ח והנחות לכיסויים הביטוחיים"
- לכל כיסוי יש שורת הנחה עם: הנחה (%) / מתאריך / עד תאריך
- מצא את ה"עד תאריך" המוקדם ביותר שעדיין בעתיד (ביחס להיום)
- החזר אותו בפורמט DD/MM/YYYY

**2. סוג ההנחה** — הנחת הצטרפות / הנחה מדורגת / הנחה לכיסויים / מיקוח / אחר

**3. פרמיה לאחר הנחה** — חפש "סה"כ דמי ביטוח חודשיים לפוליסה" או "לאחר תוספות והנחות" (הסכום שהלקוח משלם כיום)

**4. פרמיה לפני הנחה** — "לפני הנחה" או סכום לפני ההנחה

**5. סוג הביטוח** — ביטוח חיים / בריאות / ריסק / מחלות קשות / דירה / רכב / אחר

**6. חברת הביטוח** — הראל / מנורה / כלל / הכשרה / מגדל / פניקס / איילון / אחר

חזור JSON בלבד:
{"discountEndDate":"DD/MM/YYYY","discountType":"","discountedPremium":"","fullPremium":"","policyType":"","company":"","notes":"","confidence":"high/medium/low"}

אם לא מצאת תאריך הנחה, החזר discountEndDate ריק.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5', max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const raw = d.content[0].text.replace(/```json|```/g,'').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('לא נמצא JSON בתשובה');
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch(e) {
    res.json({ error: e.message });
  }
});

// חילוץ פרמיה מפוליסה לחישוב עמלות
app.post('/api/extract-premium/:clientName/:fileName', async (req, res) => {
  const filePath = path.join(CLIENTS_DIR, decodeURIComponent(req.params.clientName), decodeURIComponent(req.params.fileName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'קובץ לא נמצא' });

  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const cfgPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(cfgPath)) try { apiKey = JSON.parse(fs.readFileSync(cfgPath)).apiKey; } catch(e){}
  }
  if (!apiKey) return res.json({ error: 'no-key' });

  try {
    const b64 = fs.readFileSync(filePath).toString('base64');
    const prompt = `אתה עוזר לסוכן ביטוח ישראלי. קרא את פוליסת הביטוח ומצא:

**1. פרמיה חודשית כוללת לאחר הנחה**
חפש את הסכום שהלקוח משלם בפועל (אחרי כל הנחות):
- "סה"כ לתשלום" / "סה"כ דמי ביטוח לתשלום" — זה הסכום הנכון
- "פרמיה לאחר הנחה" / "לאחר הנחה"
- אם אין הנחה — קח את הפרמיה הכוללת הרגילה.
החזר את הפרמיה בפועל שהלקוח משלם (לאחר הנחה אם יש).

**2. סוג הביטוח** — חיים משכנתא / חיים פרטי / ריסק פרטי / מחלות קשות / בריאות / בריאות מחלות / חיים משועבד / אחר

**3. חברת הביטוח** — הראל / מנורה / כלל / הכשרה / מגדל / פניקס / איילון / אחר

**4. שם הלקוח הראשי** (שם פרטי + משפחה)

**5. תאריך תחילת הפוליסה** (DD/MM/YYYY)

**6. מספר הפוליסה** — המספר הייחודי של הפוליסה כפי שמופיע במסמך (לרוב "מספר פוליסה" / "מס' פוליסה" / "Policy No.")

חזור JSON בלבד:
{"premium":0,"policyType":"","company":"","clientName":"","startDate":"DD/MM/YYYY","policyNumber":"","confidence":"high/medium/low","notes":""}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5', max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const raw = d.content[0].text.replace(/```json|```/g,'').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('לא נמצא JSON בתשובה');
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch(e) {
    res.json({ error: e.message });
  }
});

// זיהוי חכם — קריאת מסמך ע"י Claude
app.post('/api/smart-identify', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'קובץ חסר' });
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const tmpName = req.file.filename;

  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const cfgPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(cfgPath)) {
      try { apiKey = JSON.parse(fs.readFileSync(cfgPath)).apiKey; } catch(e) {}
    }
  }
  if (!apiKey) return res.json({ tmpName, originalName, error: 'no-key' });

  try {
    const mime = req.file.mimetype;
    const b64 = fs.readFileSync(req.file.path).toString('base64');
    const prompt = 'אתה עוזר לסוכן ביטוח ישראלי. חלץ מהמסמך:\n1. שם מלא של הלקוח הראשי (שם פרטי + שם משפחה)\n2. תעודת זהות ישראלית (9 ספרות, אם קיימת)\n\nהשב JSON בלבד ללא טקסט נוסף:\n{"name":"","id":"","confidence":"high/medium/low"}';

    let content;
    if (mime === 'application/pdf') {
      content = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: prompt }];
    } else if (['image/jpeg','image/jpg','image/png','image/gif','image/webp'].includes(mime)) {
      content = [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: prompt }];
    } else {
      content = [{ type: 'text', text: 'שם קובץ: ' + originalName + '\n\n' + prompt }];
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 200, messages: [{ role: 'user', content }] })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const parsed = JSON.parse(d.content[0].text.replace(/```json|```/g,'').trim());
    res.json({ ...parsed, tmpName, originalName });
  } catch(e) {
    res.json({ name: '', id: '', confidence: 'low', tmpName, originalName, aiError: e.message });
  }
});

// סריקה חכמה מקיפה — מזהה פוליסה + חולץ הכל בבת אחת
app.post('/api/smart-scan', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'קובץ חסר' });
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const tmpName = req.file.filename;

  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const cfgPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(cfgPath)) try { apiKey = JSON.parse(fs.readFileSync(cfgPath)).apiKey; } catch(e) {}
  }
  if (!apiKey) return res.json({ tmpName, originalName, isPolicy: false, error: 'no-key' });

  try {
    const mime = req.file.mimetype;
    const b64 = fs.readFileSync(req.file.path).toString('base64');
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    const prompt = `סוכן ביטוח ישראלי. ניתח מסמך זה. היום: ${todayStr}.

האם זו פוליסת ביטוח פעילה? (פוליסה = מסמך רשמי של חברת ביטוח עם כיסוי. לא פוליסה = הצעה/קבלה/מכתב/אישור)

אם פוליסה — חלץ:
- שם מלא של המבוטח הראשי (שם פרטי ומשפחה, כולל ניקוד מדויק)
- ת.ז (9 ספרות)
- מספר פוליסה
- חברה (הראל/מנורה/כלל/הכשרה/מגדל/פניקס/איילון)
- סוג (חיים משכנתא/חיים פרטי/ריסק פרטי/מחלות קשות/בריאות/בריאות מחלות/חיים משועבד/דירה)
- תאריך תחילה DD/MM/YYYY
- פרמיה לפני הנחה (בסיס לעמלות)
- פרמיה לאחר הנחה (אם שונה)
- תאריך סיום הנחה DD/MM/YYYY
- סוג הנחה

אם לא פוליסה — חלץ רק שם + ת.ז.

JSON בלבד:
{"isPolicy":false,"clientName":"","clientId":"","policyNumber":"","company":"","policyType":"","startDate":"","fullPremium":0,"discountedPremium":0,"discountEndDate":"","discountType":"","confidence":"high/medium/low","notes":""}`;

    // Trim PDF to first 2 pages to speed up scanning (all key data is on page 1-2)
    let scanB64 = b64;
    if (mime === 'application/pdf') {
      try {
        const pdfDoc = await PDFDocument.load(Buffer.from(b64, 'base64'));
        if (pdfDoc.getPageCount() > 2) {
          const trimmed = await PDFDocument.create();
          const copied = await trimmed.copyPages(pdfDoc, [0, 1]);
          copied.forEach(p => trimmed.addPage(p));
          scanB64 = Buffer.from(await trimmed.save()).toString('base64');
        }
      } catch(e) { /* use full PDF if splitting fails */ }
    }

    let content;
    if (mime === 'application/pdf') {
      content = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: scanB64 } }, { type: 'text', text: prompt }];
    } else if (['image/jpeg','image/jpg','image/png','image/gif','image/webp'].includes(mime)) {
      content = [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: prompt }];
    } else {
      content = [{ type: 'text', text: 'שם קובץ: ' + originalName + '\n\n' + prompt }];
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-beta': 'pdfs-2024-09-25' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content }] })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const raw = d.content[0].text.replace(/```json|```/g,'').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('לא נמצא JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ ...parsed, tmpName, originalName });
  } catch(e) {
    res.json({ isPolicy: false, clientName: '', clientId: '', confidence: 'low', tmpName, originalName, aiError: e.message });
  }
});

// גיבוי אוטומטי
const BACKUPS_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);

app.post('/api/backup', (req, res) => {
  try {
    const date = new Date().toISOString().split('T')[0];
    const filepath = path.join(BACKUPS_DIR, `backup-${date}.json`);
    fs.writeFileSync(filepath, JSON.stringify(req.body, null, 2));
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('backup-')).sort();
    if (files.length > 30) files.slice(0, files.length - 30).forEach(f => fs.unlinkSync(path.join(BACKUPS_DIR, f)));
    res.json({ success: true });
  } catch(e) { res.json({ error: e.message }); }
});

// שמירה וקריאה של API key
app.get('/api/config', (req, res) => {
  const p = path.join(__dirname, 'config.json');
  try { res.json({ hasKey: !!(fs.existsSync(p) && JSON.parse(fs.readFileSync(p)).apiKey) }); }
  catch(e) { res.json({ hasKey: false }); }
});

app.post('/api/config', (req, res) => {
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify({ apiKey: req.body.apiKey }));
  res.json({ success: true });
});

// רשימת כל ה-PDFs בכל תיקיות הלקוחות
app.get('/api/all-pdfs', (req, res) => {
  try {
    const result = [];
    const clients = fs.readdirSync(CLIENTS_DIR)
      .filter(f => { try { return fs.statSync(path.join(CLIENTS_DIR, f)).isDirectory(); } catch(e) { return false; } });
    for (const client of clients) {
      const dir = path.join(CLIENTS_DIR, client);
      try {
        const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
        for (const file of files) {
          result.push({ client, file });
        }
      } catch(e) {}
    }
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('✅ העוזר האישי פועל!');
  console.log('');
  console.log('👉 פתח את הדפדפן וכנס ל: http://localhost:3000');
  console.log('');
  console.log('לעצירה: לחץ Ctrl+C');
  console.log('');
});
