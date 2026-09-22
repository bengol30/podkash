/**
 * "כפתור" הוספה לחילוץ בלשונית הקבוצות.
 *
 * Apps Script לא יכול למקם כפתור אמיתי בתוך תא — כפתורי ציור הם אובייקטים
 * צפים, אחד לגיליון, ולא אחד לשורה. תיבת סימון עם טריגר onEdit נותנת את
 * אותה חוויה: לוחצים, הקבוצה נוספת לגיליון הראשי, והסימון מתנקה מעצמו.
 */

var GROUPS_COL_NAME = 1;
var GROUPS_COL_SHORT_ID = 2;
var GROUPS_COL_CHAT_ID = 3;
var GROUPS_COL_SCORE = 4;
var GROUPS_COL_DETAIL = 5;
var GROUPS_COL_ADD = 6;
var GROUPS_COL_STATUS = 7;
var GROUPS_TOTAL_COLS = 7;

/* =========================== מבנה =========================== */

function ensureGroupsButtons_(sheet) {
  if (!sheet) return;

  sheet.getRange(1, GROUPS_COL_ADD, 1, 2)
    .setValues([['הוסף לחילוץ', 'סטטוס']])
    .setFontWeight('bold')
    .setBackground('#075E54')
    .setFontColor('#ffffff');

  sheet.setColumnWidth(GROUPS_COL_ADD, 110);
  sheet.setColumnWidth(GROUPS_COL_STATUS, 260);

  var last = sheet.getLastRow();
  if (last < 2) return;

  var range = sheet.getRange(2, GROUPS_COL_ADD, last - 1, 1);
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  range.setHorizontalAlignment('center');

  // תא ריק אחרי הוספת שורות חדשות נראה כמו תיבה חסרה. FALSE מצייר אותה.
  var values = range.getValues();
  var filled = values.map(function (v) {
    return [v[0] === true || v[0] === 'TRUE' ? v[0] : false];
  });
  range.setValues(filled);
}

/* =========================== הטריגר =========================== */

/**
 * טריגר פשוט. רץ בלי אישור הרשאות נפרד, ומוגבל ל-30 שניות — לכן הוא
 * עושה רק פעולות גיליון ולא נוגע ב-API חיצוני.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    var sheet = e.range.getSheet();
    if (sheet.getName() !== GROUPS_SHEET) return;

    var firstCol = e.range.getColumn();
    var lastCol = firstCol + e.range.getNumColumns() - 1;
    if (GROUPS_COL_ADD < firstCol || GROUPS_COL_ADD > lastCol) return;

    var startRow = Math.max(2, e.range.getRow());
    var endRow = e.range.getRow() + e.range.getNumRows() - 1;

    for (var row = startRow; row <= endRow; row++) {
      if (sheet.getRange(row, GROUPS_COL_ADD).getValue() !== true) continue;
      addGroupRowToMain_(sheet, row);
    }
  } catch (err) {
    // טריגר פשוט לא אמור להפיל עריכה של המשתמש. השגיאה נרשמת ותו לא.
    Logger.log('onEdit: ' + err.message);
  }
}

/* =========================== ההוספה =========================== */

function addGroupRowToMain_(sheet, row) {
  var checkbox = sheet.getRange(row, GROUPS_COL_ADD);
  var status = sheet.getRange(row, GROUPS_COL_STATUS);

  var name = String(sheet.getRange(row, GROUPS_COL_NAME).getValue()).trim();
  var shortId = String(sheet.getRange(row, GROUPS_COL_SHORT_ID).getValue()).trim();
  var chatId = String(sheet.getRange(row, GROUPS_COL_CHAT_ID).getValue()).trim();

  var groupId = shortId || chatId.replace('@g.us', '');

  checkbox.setValue(false);

  if (!groupId && !name) {
    status.setValue('שורה ריקה');
    return;
  }

  var main = getMainSheet_();
  var existing = findGroupInMain_(main, groupId, name);

  if (existing) {
    status.setValue('כבר קיים בגיליון, שורה ' + existing);
    return;
  }

  var target = Math.max(main.getLastRow() + 1, 2);
  main.getRange(target, COL_NAME).setValue(name);
  main.getRange(target, COL_GROUP_ID).setValue(groupId);
  // עמודת הטלפון נשארת ריקה בכוונה — כך היעד מזוהה כקבוצה ולא כאיש קשר.

  status.setValue('נוסף לגיליון, שורה ' + target + ' · ' + formatDate_(new Date()));
}

function findGroupInMain_(main, groupId, name) {
  var last = main.getLastRow();
  if (last < 2) return 0;

  var values = main.getRange(2, 1, last - 1, 3).getValues();
  var needle = normalizeText_(name);

  // מזהים גוברים על שמות. התאמה לפי שם בלבד הייתה מזהה קבוצה ואיש קשר
  // שנקראים אותו דבר כאותה שורה, ומונעת הוספה לגיטימית.
  for (var i = 0; i < values.length; i++) {
    var rowGroupId = String(values[i][COL_GROUP_ID - 1]).replace('@g.us', '').trim();
    if (groupId && rowGroupId && rowGroupId === groupId) return i + 2;
  }

  if (!needle) return 0;

  for (var j = 0; j < values.length; j++) {
    var rowId = String(values[j][COL_GROUP_ID - 1]).trim();
    if (rowId) continue; // לשורה יש id משלה, והוא לא תאם — לא אותה קבוצה
    if (String(values[j][COL_PHONE - 1]).trim()) continue; // שורת איש קשר

    if (normalizeText_(values[j][COL_NAME - 1]) === needle) return j + 2;
  }

  return 0;
}

/* =========================== גיבוי מהתפריט =========================== */

/**
 * onEdit לא נורה כשמסמנים דרך API או כשהטריגר חסום. הפעולה הזו מטפלת
 * בכל המסומנים בבת אחת, ומשמשת גם כשרוצים לסמן כמה ואז להוסיף יחד.
 */
function addCheckedGroupsToMain() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(GROUPS_SHEET);
  if (!sheet) {
    alert_('לשונית "' + GROUPS_SHEET + '" לא קיימת. הריצו קודם סנכרון או רענון קבוצות.');
    return;
  }

  ensureGroupsButtons_(sheet);

  var last = sheet.getLastRow();
  if (last < 2) {
    alert_('אין קבוצות ברשימה.');
    return;
  }

  var flags = sheet.getRange(2, GROUPS_COL_ADD, last - 1, 1).getValues();
  var handled = 0;

  for (var i = 0; i < flags.length; i++) {
    if (flags[i][0] !== true) continue;
    addGroupRowToMain_(sheet, i + 2);
    handled++;
  }

  SpreadsheetApp.flush();

  alert_(
    handled
      ? 'טופלו ' + handled + ' קבוצות מסומנות. ראו את עמודת הסטטוס.'
      : 'לא נמצאו קבוצות מסומנות. סמנו בעמודת "הוסף לחילוץ".'
  );
}
