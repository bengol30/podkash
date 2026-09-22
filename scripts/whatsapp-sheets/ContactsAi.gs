/**
 * סיכום AI לכל איש קשר, מבוסס אך ורק על מה שנמצא בלשוניות השיחה.
 *
 * העיקרון: הסיכום נבנה מראיות. מה שהאדם כתב, ומה שאחרים כתבו עליו.
 * המודל מקבל הוראה מפורשת לא להשלים פרטים מהידע הכללי שלו — כרטיס קצר
 * ונכון עדיף על כרטיס מלא ומנוחש.
 */

var PROP_OPENAI_KEY = 'OPENAI_API_KEY';
var PROP_OPENAI_MODEL = 'OPENAI_MODEL';
var DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

var MAX_CONTACTS_PER_RUN = 25;
var MAX_OWN_MESSAGES = 80;
var MAX_MENTIONS = 25;
var MAX_EVIDENCE_CHARS = 12000;
var TIME_BUDGET_MS = 270000; // 4.5 דקות מתוך 6 של Apps Script

var CHAT_DATA_FIRST_ROW = 7; // הכותרות בלשונית שיחה יושבות בשורה 6

/* =========================== הגדרת המפתח =========================== */

function setupAiKey() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getDocumentProperties();

  var keyRes = ui.prompt(
    'מפתח OpenAI',
    'הדביקו מפתח API של OpenAI (מתחיל ב-sk-):',
    ui.ButtonSet.OK_CANCEL
  );
  if (keyRes.getSelectedButton() !== ui.Button.OK) return;

  var key = keyRes.getResponseText().trim();
  if (!key) {
    ui.alert('לא הוזן מפתח.');
    return;
  }

  var modelRes = ui.prompt(
    'מודל',
    'איזה מודל להשתמש? (ריק = ' + DEFAULT_OPENAI_MODEL + ')',
    ui.ButtonSet.OK_CANCEL
  );
  var model = DEFAULT_OPENAI_MODEL;
  if (modelRes.getSelectedButton() === ui.Button.OK) {
    var typed = modelRes.getResponseText().trim();
    if (typed) model = typed;
  }

  props.setProperty(PROP_OPENAI_KEY, key);
  props.setProperty(PROP_OPENAI_MODEL, model);

  ui.alert('נשמר. המודל: ' + model);
}

/* =========================== נקודות כניסה =========================== */

function summarizeContacts() {
  runSummaries_(false);
}

function summarizeContactsForce() {
  var ui = SpreadsheetApp.getUi();
  var confirmed = ui.alert(
    'רענון מלא',
    'לייצר מחדש סיכום לכל אנשי הקשר, כולל כאלה שכבר יש להם סיכום?\n' +
      'הסיכומים הקיימים יוחלפו. הערות ידניות לא ייפגעו.',
    ui.ButtonSet.YES_NO
  );
  if (confirmed !== ui.Button.YES) return;
  runSummaries_(true);
}

function runSummaries_(force) {
  var started = Date.now();
  var sheet = ensureContactsSheet_();
  var last = sheet.getLastRow();

  if (last < 2) {
    alert_('אין עדיין אנשי קשר. הריצו קודם חילוץ היסטוריה.');
    return;
  }

  try {
    getAiConfig_();
  } catch (err) {
    alert_('שגיאה: ' + err.message);
    return;
  }

  var rows = sheet.getRange(2, 1, last - 1, CONTACTS_HEADERS.length).getValues();
  var pending = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = String(r[CC_KEY - 1]).replace(/\D/g, '');
    if (!key) continue;

    var summary = String(r[CC_SUMMARY - 1]).trim();
    var summaryAt = r[CC_SUMMARY_AT - 1];
    var lastSeen = r[CC_LAST - 1];

    var needs = force || !summary;
    if (!needs && lastSeen instanceof Date && summaryAt instanceof Date) {
      needs = lastSeen > summaryAt; // הגיעו הודעות חדשות מאז הסיכום
    }
    if (!needs) continue;

    pending.push({
      row: i + 2,
      key: key,
      name: String(r[CC_NAME - 1]).trim(),
      aliases: String(r[CC_ALIASES - 1]).trim(),
      sources: String(r[CC_SOURCES - 1]).trim()
    });
  }

  if (!pending.length) {
    alert_('כל אנשי הקשר מסוכמים ומעודכנים. אין מה לעשות.');
    return;
  }

  var evidence = buildEvidenceIndex_();

  var done = 0;
  var failed = 0;
  var stoppedEarly = false;

  for (var p = 0; p < pending.length; p++) {
    if (done >= MAX_CONTACTS_PER_RUN || Date.now() - started > TIME_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }

    var contact = pending[p];
    try {
      var text = summarizeOneContact_(contact, evidence);
      sheet.getRange(contact.row, CC_SUMMARY).setValue(text).setWrap(true);
      sheet.getRange(contact.row, CC_SUMMARY_AT).setValue(new Date());
      done++;
    } catch (err) {
      sheet.getRange(contact.row, CC_SUMMARY).setValue('שגיאת סיכום: ' + err.message);
      failed++;
    }
    SpreadsheetApp.flush();
  }

  var remaining = pending.length - done - failed;
  var message = 'סוכמו: ' + done + '\nנכשלו: ' + failed;
  if (remaining > 0) {
    message += '\nנשארו: ' + remaining + '\n\nהריצו שוב כדי להמשיך מהמקום שנעצר.';
  }
  if (stoppedEarly) {
    message += '\n(נעצר כדי לא לחרוג ממגבלת זמן הריצה של Apps Script.)';
  }
  alert_(message);
}

/* =========================== איסוף ראיות =========================== */

/**
 * קורא את כל לשוניות השיחה פעם אחת ובונה אינדקס.
 * בלי זה היינו קוראים את כל הלשוניות מחדש לכל איש קשר.
 */
function buildEvidenceIndex_() {
  var sheets = SpreadsheetApp.getActive().getSheets();
  var byPhone = {};
  var all = [];

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();
    if (name.indexOf(CHAT_SHEET_PREFIX) !== 0) continue;

    var lastRow = sheet.getLastRow();
    if (lastRow < CHAT_DATA_FIRST_ROW) continue;

    var label = name.substring(CHAT_SHEET_PREFIX.length);
    var values = sheet.getRange(
      CHAT_DATA_FIRST_ROW,
      1,
      lastRow - CHAT_DATA_FIRST_ROW + 1,
      CHAT_HEADERS.length
    ).getValues();

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var text = String(row[6] || '').trim();
      if (!text) continue;

      var entry = {
        label: label,
        date: String(row[1] || ''),
        sender: String(row[3] || ''),
        phone: String(row[4] || '').replace(/\D/g, ''),
        text: text
      };

      all.push(entry);
      if (entry.phone) {
        if (!byPhone[entry.phone]) byPhone[entry.phone] = [];
        byPhone[entry.phone].push(entry);
      }
    }
  }

  return { byPhone: byPhone, all: all };
}

function gatherEvidenceFor_(contact, evidence) {
  var own = (evidence.byPhone[contact.key] || []).slice(-MAX_OWN_MESSAGES);

  var names = [];
  if (contact.name) names.push(contact.name);
  if (contact.aliases) {
    var parts = contact.aliases.split(' | ');
    for (var a = 0; a < parts.length; a++) {
      if (parts[a].trim()) names.push(parts[a].trim());
    }
  }

  var mentions = [];
  for (var n = 0; n < names.length && mentions.length < MAX_MENTIONS; n++) {
    var needle = normalizeText_(names[n]);
    if (needle.length < 2 || /^\d+$/.test(needle)) continue;

    for (var i = 0; i < evidence.all.length && mentions.length < MAX_MENTIONS; i++) {
      var entry = evidence.all[i];
      if (entry.phone === contact.key) continue; // זה הוא, לא עליו
      if (normalizeText_(entry.text).indexOf(needle) === -1) continue;
      mentions.push(entry);
    }
  }

  return { own: own, mentions: mentions };
}

function buildEvidenceText_(contact, gathered) {
  var lines = [];

  lines.push('### זיהוי');
  lines.push('טלפון: +' + contact.key);
  if (contact.name) lines.push('שם: ' + contact.name);
  if (contact.aliases) lines.push('שמות נוספים: ' + contact.aliases);
  if (contact.sources) lines.push('נמצא בשיחות: ' + contact.sources);

  lines.push('');
  lines.push('### הודעות שהוא כתב (' + gathered.own.length + ')');
  if (gathered.own.length) {
    for (var i = 0; i < gathered.own.length; i++) {
      var o = gathered.own[i];
      lines.push('[' + o.label + ' · ' + o.date + '] ' + o.text);
    }
  } else {
    lines.push('(אין)');
  }

  lines.push('');
  lines.push('### הודעות של אחרים שמזכירות אותו (' + gathered.mentions.length + ')');
  if (gathered.mentions.length) {
    for (var j = 0; j < gathered.mentions.length; j++) {
      var m = gathered.mentions[j];
      lines.push('[' + m.label + ' · ' + m.date + '] ' + m.sender + ': ' + m.text);
    }
  } else {
    lines.push('(אין)');
  }

  var text = lines.join('\n');
  if (text.length > MAX_EVIDENCE_CHARS) {
    text = text.substring(0, MAX_EVIDENCE_CHARS) + '\n... (נחתך)';
  }
  return text;
}

/* =========================== הסיכום =========================== */

function summarizeOneContact_(contact, evidence) {
  var gathered = gatherEvidenceFor_(contact, evidence);

  if (!gathered.own.length && !gathered.mentions.length) {
    return 'אין מספיק חומר לסיכום — לא נמצאו הודעות של איש הקשר הזה ולא אזכורים שלו.';
  }

  var system = [
    'אתה בונה כרטיס מידע תמציתי על איש קשר, על בסיס הודעות ווטסאפ בלבד.',
    '',
    'חוקים מחייבים:',
    '- כתוב אך ורק מה שנתמך ישירות בהודעות שלפניך.',
    '- אל תשלים פרטים מהידע הכללי שלך. אם השם מוכר לך מהעולם, התעלם מזה לחלוטין.',
    '- מה שלא ידוע — פשוט לא מופיע. אל תכתוב "לא ידוע" ואל תנחש.',
    '- מסקנה שמשתמעת אך לא נאמרה במפורש — סמן אותה ב-(משוער).',
    '- כרטיס קצר ונכון עדיף על כרטיס ארוך ומנוחש.',
    '',
    'מבנה (השמט כל סעיף שאין לגביו חומר):',
    '**תפקיד ועיסוק**',
    '**נושאים שחוזרים אצלו**',
    '**פרטים מעשיים** — מקום, זמינות, כלים, קישורים, תאריכים שהזכיר',
    '**סגנון תקשורת**',
    '**פתוח מולו** — משימות או שאלות שנשארו תלויות',
    '',
    'כתוב בעברית, בנקודות קצרות. בלי הקדמה ובלי סיכום מסכם.'
  ].join('\n');

  var user = buildEvidenceText_(contact, gathered);

  return callOpenAi_(system, user);
}

function getAiConfig_() {
  var props = PropertiesService.getDocumentProperties();
  var key = props.getProperty(PROP_OPENAI_KEY);
  if (!key) {
    throw new Error('חסר מפתח OpenAI. הריצו: ווטסאפ ← הגדרת מפתח OpenAI.');
  }
  return {
    key: key,
    model: props.getProperty(PROP_OPENAI_MODEL) || DEFAULT_OPENAI_MODEL
  };
}

function callOpenAi_(system, user) {
  var cfg = getAiConfig_();

  var messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];

  // משפחות המודלים של OpenAI חלוקות בשמות הפרמטרים: הדורות הישנים מקבלים
  // max_tokens ו-temperature, החדשים דורשים max_completion_tokens ומתעלמים
  // מ-temperature. מנסים קודם את הישן ונופלים לחדש לפי השגיאה, כדי שהחלפת
  // מודל בהגדרות לא תשבור כלום.
  var response = postToOpenAi_(cfg, {
    model: cfg.model,
    messages: messages,
    temperature: 0.2,
    max_tokens: 900
  });

  if (response.code === 400 && /max_tokens|temperature|unsupported|unrecognized/i.test(response.body)) {
    response = postToOpenAi_(cfg, {
      model: cfg.model,
      messages: messages,
      max_completion_tokens: 3000 // אצל מודלי חשיבה גם טוקני החשיבה נספרים כאן
    });
  }

  if (response.code === 401) throw new Error('מפתח OpenAI שגוי או פג תוקף.');
  if (response.code === 404) {
    throw new Error('המודל "' + cfg.model + '" לא קיים או לא זמין לחשבון שלכם.');
  }
  if (response.code === 429) throw new Error('חריגה ממכסת OpenAI. נסו שוב בעוד דקה.');
  if (response.code >= 400) {
    throw new Error('OpenAI החזיר ' + response.code + ': ' + response.body.substring(0, 300));
  }

  var data;
  try {
    data = JSON.parse(response.body);
  } catch (err) {
    throw new Error('תשובה לא תקינה מ-OpenAI.');
  }

  if (!data.choices || !data.choices.length || !data.choices[0].message) {
    throw new Error('OpenAI לא החזיר תוכן.');
  }

  var content = String(data.choices[0].message.content || '').trim();
  if (!content) {
    // קורה כשמודל חשיבה מכלה את התקציב על חשיבה ולא נשאר לו לתשובה.
    throw new Error('המודל החזיר תשובה ריקה. נסו מודל אחר או העלו את תקציב הטוקנים.');
  }

  return content;
}

function postToOpenAi_(cfg, payload) {
  var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + cfg.key },
    payload: JSON.stringify(payload)
  });

  return { code: response.getResponseCode(), body: response.getContentText() };
}
