/**
 * לשונית "אנשי קשר" — מצטברת, ממוזגת, ולעולם לא נדרסת.
 *
 * אחרי כל חילוץ היסטוריה, כל מי שכתב הודעה נכנסת נרשם כאן. המפתח הוא מספר
 * הטלפון המנורמל, כך שאותו אדם שמופיע בשלוש קבוצות הוא שורה אחת.
 *
 * כללי המיזוג:
 *   - שורות נמחקות לעולם לא. גם לא מנוקות.
 *   - "שם" נכתב רק אם התא ריק. שמות אחרים נצברים ב"שמות נוספים".
 *   - "מקורות" שומר ספירה לכל שיחה בנפרד, כך שחילוץ חוזר של אותה שיחה
 *     מעדכן את הערך שלה במקום להכפיל אותו.
 *   - "הערות ידניות" היא שלכם. הקוד לא נוגע בה אף פעם.
 */

var CONTACTS_SHEET = 'אנשי קשר';

var CC_KEY = 1;           // מזהה - טלפון מנורמל, מפתח הכפילויות
var CC_NAME = 2;          // שם
var CC_ALIASES = 3;       // שמות נוספים
var CC_PHONE = 4;         // טלפון לתצוגה
var CC_KIND = 5;          // סוג
var CC_SOURCES = 6;       // מקורות - "שיחה (42) | שיחה (7)"
var CC_TOTAL = 7;         // סה"כ הודעות
var CC_FIRST = 8;         // הודעה ראשונה
var CC_LAST = 9;          // הודעה אחרונה
var CC_SUMMARY = 10;      // סיכום AI
var CC_SUMMARY_AT = 11;   // עודכן סיכום
var CC_NOTES = 12;        // הערות ידניות - הקוד לא נוגע
var CC_CHANGELOG = 13;    // יומן שינויים - נצבר, החדש למעלה

var CONTACTS_HEADERS = [
  'מזהה',
  'שם',
  'שמות נוספים',
  'טלפון',
  'סוג',
  'מקורות',
  'סה״כ הודעות',
  'הודעה ראשונה',
  'הודעה אחרונה',
  'סיכום AI',
  'עודכן סיכום',
  'הערות ידניות',
  'יומן שינויים'
];

var KIND_DIRECT = 'איש קשר';
var KIND_GROUP = 'משתתף בקבוצה';
var KIND_BOTH = 'איש קשר + קבוצות';

/* =========================== מבנה הלשונית =========================== */

function ensureContactsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONTACTS_SHEET);
  var created = false;

  if (!sheet) {
    sheet = ss.insertSheet(CONTACTS_SHEET);
    created = true;
  }

  var header = sheet.getRange(1, 1, 1, CONTACTS_HEADERS.length);

  // גיליון שנוצר לפני שנוספה עמודה צריך לקבל את הכותרות החדשות.
  // כתיבת שורת הכותרות לא נוגעת בנתונים שמתחתיה.
  var stale = created;
  if (!stale) {
    var current = header.getValues()[0];
    for (var h = 0; h < CONTACTS_HEADERS.length; h++) {
      if (String(current[h]).trim() !== CONTACTS_HEADERS[h]) {
        stale = true;
        break;
      }
    }
  }

  if (stale) {
    header.setValues([CONTACTS_HEADERS])
      .setFontWeight('bold')
      .setBackground('#075E54')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);

    sheet.setColumnWidth(CC_KEY, 130);
    sheet.setColumnWidth(CC_NAME, 160);
    sheet.setColumnWidth(CC_ALIASES, 180);
    sheet.setColumnWidth(CC_PHONE, 140);
    sheet.setColumnWidth(CC_KIND, 130);
    sheet.setColumnWidth(CC_SOURCES, 260);
    sheet.setColumnWidth(CC_TOTAL, 90);
    sheet.setColumnWidth(CC_FIRST, 130);
    sheet.setColumnWidth(CC_LAST, 130);
    sheet.setColumnWidth(CC_SUMMARY, 560);
    sheet.setColumnWidth(CC_SUMMARY_AT, 130);
    sheet.setColumnWidth(CC_NOTES, 260);
    sheet.setColumnWidth(CC_CHANGELOG, 420);

    sheet.getRange(1, CC_KEY, sheet.getMaxRows(), 1).setNumberFormat('@');
    sheet.getRange(1, CC_PHONE, sheet.getMaxRows(), 1).setNumberFormat('@');
    var dateFormat = 'dd/mm/yyyy hh:mm';
    sheet.getRange(2, CC_FIRST, sheet.getMaxRows() - 1, 1).setNumberFormat(dateFormat);
    sheet.getRange(2, CC_LAST, sheet.getMaxRows() - 1, 1).setNumberFormat(dateFormat);
    sheet.getRange(2, CC_SUMMARY_AT, sheet.getMaxRows() - 1, 1).setNumberFormat(dateFormat);
  }

  return sheet;
}

/* =========================== איסוף מההודעות =========================== */

/**
 * עובר על ההודעות של שיחה אחת ומחזיר מפה של אנשי קשר לפי טלפון מנורמל.
 * הודעות יוצאות מדולגות — הן שלנו.
 */
function collectContactsFromRows_(rows, target) {
  var kind = target.kind === 'group' ? KIND_GROUP : KIND_DIRECT;
  var found = {};

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row[2]) !== 'נכנסת') continue; // יוצאות הן שלנו

    var key = String(row[4] || '').replace(/\D/g, '');
    if (!key) continue;

    var when = row[1] instanceof Date ? row[1] : null;
    var senderName = String(row[3] || '').trim();
    var entry = found[key];

    if (!entry) {
      entry = found[key] = {
        key: key,
        name: '',
        kind: kind,
        count: 0,
        first: null,
        last: null
      };
    }

    entry.count++;
    if (senderName && !entry.name) entry.name = senderName;
    if (when) {
      if (!entry.first || when < entry.first) entry.first = when;
      if (!entry.last || when > entry.last) entry.last = when;
    }
  }

  var out = [];
  for (var k in found) {
    if (Object.prototype.hasOwnProperty.call(found, k)) out.push(found[k]);
  }
  return out;
}

function syncContactsFromChat_(label, target, rows) {
  // rows הן שורות הארכיון המלא של השיחה, לא רק החלון שנמשך עכשיו,
  // כך שהספירה ב"מקורות" משקפת את כל מה שידוע ולא את המשיכה האחרונה.
  var contacts = collectContactsFromRows_(rows, target);
  if (!contacts.length) return { added: 0, updated: 0 };

  var sheet = ensureContactsSheet_();

  // כל הטבלה נקראת פעם אחת, משתנה בזיכרון, ונכתבת בחזרה פעם אחת.
  // הגרסה הקודמת כתבה תא-תא: כשמונה הלוך-חזור לשרת לכל איש קשר בכל
  // שיחה, כלומר 1,600 קריאות לקבוצה עם 200 משתתפים — מספיק כדי לחרוג
  // ממגבלת הזמן של Apps Script על קבוצה אחת גדולה.
  //
  // נקראות גם עמודות הציון, כך שמה שאיננו הבעלים שלו נכתב בחזרה כפי
  // שהיה: הסיכום, יומן השינויים וההערות הידניות.
  var width = CONTACTS_HEADERS.length + 2;
  var last = sheet.getLastRow();
  var table = last >= 2 ? sheet.getRange(2, 1, last - 1, width).getValues() : [];

  var index = {};
  for (var i = 0; i < table.length; i++) {
    var existingKey = String(table[i][CC_KEY - 1]).replace(/\D/g, '');
    if (existingKey && index[existingKey] === undefined) index[existingKey] = i;
  }

  var added = 0;
  var updated = 0;

  for (var c = 0; c < contacts.length; c++) {
    var contact = contacts[c];
    var at = index[contact.key];

    if (at === undefined) {
      var blank = [];
      for (var b = 0; b < width; b++) blank.push('');
      blank[CC_KEY - 1] = contact.key;
      blank[CC_PHONE - 1] = '+' + contact.key;

      table.push(blank);
      at = table.length - 1;
      index[contact.key] = at;
      added++;
    } else {
      updated++;
    }

    mergeContactValues_(table[at], contact, label);
  }

  if (table.length) {
    sheet.getRange(2, 1, table.length, width).setValues(table);
  }

  SpreadsheetApp.flush();
  return { added: added, updated: updated };
}

/** אותם כללי מיזוג כמו קודם, על מערך בזיכרון במקום על תאים. */
function mergeContactValues_(row, contact, label) {
  // שם: נכתב רק אם ריק. שם אחר נצבר לשמות נוספים.
  var currentName = String(row[CC_NAME - 1]).trim();
  if (contact.name) {
    if (!currentName) {
      row[CC_NAME - 1] = contact.name;
    } else if (normalizeText_(currentName) !== normalizeText_(contact.name)) {
      row[CC_ALIASES - 1] = addAliasTo_(String(row[CC_ALIASES - 1]), contact.name);
    }
  }

  // סוג: מי שנראה גם בשיחה פרטית וגם בקבוצה מסומן כשניהם.
  var currentKind = String(row[CC_KIND - 1]).trim();
  if (!currentKind) {
    row[CC_KIND - 1] = contact.kind;
  } else if (currentKind !== contact.kind && currentKind !== KIND_BOTH) {
    row[CC_KIND - 1] = KIND_BOTH;
  }

  // מקורות: מעדכנים את הערך של השיחה הזו, לא מוסיפים עוד אחד.
  var sources = parseSources_(String(row[CC_SOURCES - 1]));
  var matched = false;

  for (var i = 0; i < sources.length; i++) {
    if (sources[i].label === label) {
      sources[i].count = contact.count;
      matched = true;
      break;
    }
  }
  if (!matched) sources.push({ label: label, count: contact.count });

  row[CC_SOURCES - 1] = serializeSources_(sources);

  var total = 0;
  for (var j = 0; j < sources.length; j++) total += sources[j].count;
  row[CC_TOTAL - 1] = total;

  // טווח תאריכים: מרחיבים, אף פעם לא מצמצמים.
  if (contact.first) {
    var existingFirst = row[CC_FIRST - 1];
    if (!(existingFirst instanceof Date) || contact.first < existingFirst) {
      row[CC_FIRST - 1] = contact.first;
    }
  }
  if (contact.last) {
    var existingLast = row[CC_LAST - 1];
    if (!(existingLast instanceof Date) || contact.last > existingLast) {
      row[CC_LAST - 1] = contact.last;
    }
  }

  // סיכום AI, יומן שינויים והערות ידניות לא נגענו בהם בכוונה.
}

function addAliasTo_(current, name) {
  var parts = current ? current.split(' | ') : [];

  for (var i = 0; i < parts.length; i++) {
    if (normalizeText_(parts[i]) === normalizeText_(name)) return current;
  }
  parts.push(name);
  return parts.join(' | ');
}

function parseSources_(value) {
  if (!value) return [];
  var out = [];
  var parts = String(value).split(' | ');

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) continue;
    var match = part.match(/^(.*)\s\((\d+)\)$/);
    if (match) {
      out.push({ label: match[1], count: parseInt(match[2], 10) || 0 });
    } else {
      out.push({ label: part, count: 0 });
    }
  }
  return out;
}

function serializeSources_(sources) {
  return sources
    .map(function (s) {
      return s.label + ' (' + s.count + ')';
    })
    .join(' | ');
}
