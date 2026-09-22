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
  'הערות ידניות'
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
  if (created || String(header.getValue()).trim() !== CONTACTS_HEADERS[0]) {
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
function collectContactsFromMessages_(messages, target) {
  var kind = target.kind === 'group' ? KIND_GROUP : KIND_DIRECT;
  var found = {};

  for (var i = 0; i < messages.length; i++) {
    var parsed = parseMessage_(messages[i]);
    if (parsed.direction !== 'נכנסת') continue;

    var key = String(parsed.senderPhone || '').replace(/\D/g, '');
    if (!key) continue;

    var when = messages[i].timestamp ? new Date(Number(messages[i].timestamp) * 1000) : null;
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
    if (parsed.senderName && !entry.name) entry.name = String(parsed.senderName).trim();
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

/**
 * ממזג את אנשי הקשר של שיחה אחת לתוך הלשונית. נקרא מ-runExtraction_.
 * מחזיר {added, updated}.
 */
function syncContactsFromChat_(label, target, messages) {
  var contacts = collectContactsFromMessages_(messages, target);
  if (!contacts.length) return { added: 0, updated: 0 };

  var sheet = ensureContactsSheet_();
  var index = buildContactsIndex_(sheet);

  var added = 0;
  var updated = 0;

  for (var i = 0; i < contacts.length; i++) {
    var c = contacts[i];
    var row = index[c.key];

    if (!row) {
      row = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(row, CC_KEY).setValue(c.key);
      sheet.getRange(row, CC_PHONE).setValue('+' + c.key);
      index[c.key] = row;
      added++;
    } else {
      updated++;
    }

    mergeContactRow_(sheet, row, c, label);
  }

  SpreadsheetApp.flush();
  return { added: added, updated: updated };
}

function buildContactsIndex_(sheet) {
  var index = {};
  var last = sheet.getLastRow();
  if (last < 2) return index;

  var keys = sheet.getRange(2, CC_KEY, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    var key = String(keys[i][0]).replace(/\D/g, '');
    if (key && !index[key]) index[key] = i + 2;
  }
  return index;
}

function mergeContactRow_(sheet, row, contact, label) {
  // שם: נכתב רק אם ריק. שם אחר נצבר לשמות נוספים.
  var nameCell = sheet.getRange(row, CC_NAME);
  var currentName = String(nameCell.getValue()).trim();

  if (contact.name) {
    if (!currentName) {
      nameCell.setValue(contact.name);
    } else if (normalizeText_(currentName) !== normalizeText_(contact.name)) {
      addAlias_(sheet, row, contact.name);
    }
  }

  // סוג: מי שנראה גם בשיחה פרטית וגם בקבוצה מסומן כשניהם.
  var kindCell = sheet.getRange(row, CC_KIND);
  var currentKind = String(kindCell.getValue()).trim();
  if (!currentKind) {
    kindCell.setValue(contact.kind);
  } else if (currentKind !== contact.kind && currentKind !== KIND_BOTH) {
    kindCell.setValue(KIND_BOTH);
  }

  // מקורות: מעדכנים את הערך של השיחה הזו, לא מוסיפים עוד אחד.
  var sourcesCell = sheet.getRange(row, CC_SOURCES);
  var sources = parseSources_(String(sourcesCell.getValue()));
  var matched = false;

  for (var i = 0; i < sources.length; i++) {
    if (sources[i].label === label) {
      sources[i].count = contact.count;
      matched = true;
      break;
    }
  }
  if (!matched) sources.push({ label: label, count: contact.count });

  sourcesCell.setValue(serializeSources_(sources));

  var total = 0;
  for (var j = 0; j < sources.length; j++) total += sources[j].count;
  sheet.getRange(row, CC_TOTAL).setValue(total);

  // טווח תאריכים: מרחיבים, אף פעם לא מצמצמים.
  if (contact.first) {
    var firstCell = sheet.getRange(row, CC_FIRST);
    var existingFirst = firstCell.getValue();
    if (!(existingFirst instanceof Date) || contact.first < existingFirst) {
      firstCell.setValue(contact.first);
    }
  }
  if (contact.last) {
    var lastCell = sheet.getRange(row, CC_LAST);
    var existingLast = lastCell.getValue();
    if (!(existingLast instanceof Date) || contact.last > existingLast) {
      lastCell.setValue(contact.last);
    }
  }

  // סיכום AI והערות ידניות לא נגענו בהם בכוונה.
}

function addAlias_(sheet, row, name) {
  var cell = sheet.getRange(row, CC_ALIASES);
  var current = String(cell.getValue());
  var parts = current ? current.split(' | ') : [];

  for (var i = 0; i < parts.length; i++) {
    if (normalizeText_(parts[i]) === normalizeText_(name)) return;
  }
  parts.push(name);
  cell.setValue(parts.join(' | '));
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
