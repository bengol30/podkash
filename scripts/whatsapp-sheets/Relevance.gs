/**
 * דירוג רלוונטיות לאנשי קשר, שיחות וקבוצות.
 *
 * מיון לפי כמות הודעות בלבד מטעה: קבוצה רועשת שלא נגעת בה חודש תעקוף
 * את הלקוח שכתב לך אתמול. לכן הציון משקלל חמישה אותות, וכל אחד עונה על
 * שאלה אחרת:
 *
 *   טריות   (35%) — מתי דיברתם לאחרונה. הדעיכה מעריכית, חצי חיים ~10 ימים.
 *   נפח     (25%) — כמה הודעות בחודש האחרון. לוגריתמי, כדי שקבוצה ענקית
 *                   לא תמחק את כל השאר.
 *   עקביות  (20%) — בכמה ימים שונים הייתה פעילות. עשרים הודעות על פני
 *                   עשרה ימים הן קשר חי; עשרים בפרץ אחד הן אירוע.
 *   מעורבות (10%) — בשיחה: כמה אתה עצמך כותב שם. באיש קשר: בכמה שיחות
 *                   שונות הוא פעיל, כלומר כמה הוא מרכזי אצלך.
 *   מגמה    (10%) — 30 הימים האחרונים מול ה-30 שלפניהם. מי שמתגבר רלוונטי
 *                   יותר ממי שדועך, גם באותו נפח.
 */

var RELEVANCE_WINDOW_DAYS = 30;
var RECENCY_HALFLIFE_DAYS = 14;

var W_RECENCY = 0.35;
var W_VOLUME = 0.25;
var W_CONSISTENCY = 0.20;
var W_ENGAGEMENT = 0.10;
var W_TREND = 0.10;

/* =========================== נקודת כניסה =========================== */

function updateRelevanceRanking() {
  migrateChatSheetNames_();

  var stats;
  try {
    stats = buildActivityStats_();
  } catch (err) {
    alert_('שגיאה באיסוף הנתונים: ' + err.message);
    return;
  }

  if (!stats.chatCount) {
    alert_('אין עדיין לשוניות שיחה. הריצו קודם חילוץ היסטוריה.');
    return;
  }

  var lines = [];
  lines.push(rankContactsSheet_(stats));
  lines.push(rankMainSheet_(stats));
  lines.push(rankGroupsSheet_(stats));

  alert_(
    'הדירוג עודכן.\n\n' +
      lines.join('\n') +
      '\n\nהחלון: ' + RELEVANCE_WINDOW_DAYS + ' הימים האחרונים.'
  );
}

/* =========================== איסוף נתונים =========================== */

/**
 * מעבר אחד על כל לשוניות השיחה. בונה סטטיסטיקה לשיחות ולאנשי קשר גם יחד,
 * כדי לא לקרוא את אותן לשוניות פעמיים.
 */
function buildActivityStats_() {
  var now = new Date();
  var windowStart = new Date(now.getTime() - RELEVANCE_WINDOW_DAYS * 86400000);
  var prevStart = new Date(now.getTime() - 2 * RELEVANCE_WINDOW_DAYS * 86400000);

  var sheets = SpreadsheetApp.getActive().getSheets();
  var chats = {};
  var byChatId = {};
  var contacts = {};
  var chatCount = 0;

  function blank() {
    return {
      messages: 0,
      prevMessages: 0,
      outgoing: 0,
      lastAt: null,
      activeDays: {},
      chats: {}
    };
  }

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sheetName = sheet.getName();
    if (sheetName.indexOf(CHAT_SHEET_PREFIX) !== 0) continue;

    var lastRow = sheet.getLastRow();
    if (lastRow < CHAT_DATA_FIRST_ROW) continue;

    var label = parseChatSheetName_(sheetName).label;
    var chatId = String(sheet.getRange(2, 2).getValue()).trim();

    var chat = chats[label] = blank();
    if (chatId) byChatId[chatId] = chat;
    chatCount++;

    var values = sheet.getRange(
      CHAT_DATA_FIRST_ROW,
      1,
      lastRow - CHAT_DATA_FIRST_ROW + 1,
      CHAT_HEADERS.length
    ).getValues();

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var when = row[1] instanceof Date ? row[1] : null;
      if (!when) continue;

      var outgoing = String(row[2]) === 'יוצאת';
      var phone = String(row[4] || '').replace(/\D/g, '');
      var dayKey = Utilities.formatDate(when, 'Asia/Jerusalem', 'yyyy-MM-dd');

      touch_(chat, when, dayKey, outgoing, windowStart, prevStart);

      if (!outgoing && phone) {
        if (!contacts[phone]) contacts[phone] = blank();
        touch_(contacts[phone], when, dayKey, false, windowStart, prevStart);
        contacts[phone].chats[label] = true;
      }
    }
  }

  return {
    chats: chats,
    byChatId: byChatId,
    contacts: contacts,
    chatCount: chatCount,
    maxChat: maxMessages_(chats),
    maxContact: maxMessages_(contacts)
  };
}

function touch_(target, when, dayKey, outgoing, windowStart, prevStart) {
  if (!target.lastAt || when > target.lastAt) target.lastAt = when;

  if (when >= windowStart) {
    target.messages++;
    target.activeDays[dayKey] = true;
    if (outgoing) target.outgoing++;
  } else if (when >= prevStart) {
    target.prevMessages++;
  }
}

function maxMessages_(map) {
  var max = 0;
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k) && map[k].messages > max) {
      max = map[k].messages;
    }
  }
  return max;
}

/* =========================== הציון =========================== */

function scoreOf_(st, maxMessages, kind) {
  if (!st) return { score: 0, detail: 'אין נתונים' };

  var activeDays = countKeys_(st.activeDays);
  var chatCount = countKeys_(st.chats);

  var daysSince = st.lastAt
    ? (new Date().getTime() - st.lastAt.getTime()) / 86400000
    : 99999;

  var recency = 100 * Math.exp(-Math.max(0, daysSince) / RECENCY_HALFLIFE_DAYS);

  var volume = maxMessages > 0
    ? 100 * (Math.log(1 + st.messages) / Math.log(1 + maxMessages))
    : 0;

  var consistency = 100 * Math.min(1, activeDays / RELEVANCE_WINDOW_DAYS);

  var engagement;
  if (kind === 'contact') {
    // מי שפעיל בכמה שיחות שלך הוא מרכזי יותר מאשר מי שמופיע באחת.
    engagement = 100 * Math.min(1, chatCount / 3);
  } else {
    // שיחה שאתה עצמך כותב בה היא קשר, לא צפייה. שליש יוצאות = ציון מלא.
    engagement = 100 * Math.min(1, (st.outgoing / Math.max(1, st.messages)) * 3);
  }

  var totalWindow = st.messages + st.prevMessages;
  var trend = totalWindow > 0 ? 100 * (st.messages / totalWindow) : 0;

  var score =
    W_RECENCY * recency +
    W_VOLUME * volume +
    W_CONSISTENCY * consistency +
    W_ENGAGEMENT * engagement +
    W_TREND * trend;

  return {
    score: Math.round(score * 10) / 10,
    detail: detailOf_(st, activeDays, daysSince, trend)
  };
}

function detailOf_(st, activeDays, daysSince, trend) {
  if (!st.messages && !st.prevMessages) {
    return st.lastAt ? 'אין פעילות ב-' + RELEVANCE_WINDOW_DAYS + ' יום' : 'אין נתונים';
  }

  var parts = [];
  parts.push(st.messages + ' הודעות');
  parts.push(activeDays + ' ימים פעילים');

  if (daysSince < 1) {
    parts.push('היום');
  } else if (daysSince < 99999) {
    parts.push('לפני ' + Math.round(daysSince) + ' ימים');
  }

  // יחס בין החלונות לבדו מטעה כשהפעילות עצמה ישנה: ארבעים הודעות
  // שכולן מלפני 25 יום אינן "חדש", הן גוססות. לכן הטריות גוברת.
  if (daysSince > RELEVANCE_WINDOW_DAYS / 2) {
    parts.push('דועך');
  } else if (!st.prevMessages && st.messages) {
    parts.push('חדש');
  } else if (trend > 60) {
    parts.push('עולה');
  } else if (trend < 40) {
    parts.push('דועך');
  } else {
    parts.push('יציב');
  }

  return parts.join(' · ');
}

function countKeys_(obj) {
  var n = 0;
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) n++;
  }
  return n;
}

/* =========================== כתיבה ומיון =========================== */

/**
 * מיון מתבצע דרך Range.sort המובנה ולא דרך setValues, כדי שקישורים,
 * תאריכים ועיצוב ינועו עם השורה במקום להישרף.
 */
function writeScoresAndSort_(sheet, firstDataRow, totalCols, scoreCol, rows) {
  if (!rows.length) return 0;

  var payload = rows.map(function (r) {
    return [r.score, r.detail];
  });

  sheet.getRange(firstDataRow, scoreCol, payload.length, 2).setValues(payload);
  sheet.getRange(firstDataRow, scoreCol, payload.length, 1).setNumberFormat('0.0');

  var width = Math.max(totalCols, scoreCol + 1);
  sheet.getRange(firstDataRow, 1, payload.length, width)
    .sort({ column: scoreCol, ascending: false });

  return payload.length;
}

function ensureScoreHeaders_(sheet, scoreCol) {
  sheet.getRange(1, scoreCol, 1, 2)
    .setValues([['ציון רלוונטיות', 'פירוט']])
    .setFontWeight('bold')
    .setBackground('#128C7E')
    .setFontColor('#ffffff');
  sheet.setColumnWidth(scoreCol, 120);
  sheet.setColumnWidth(scoreCol + 1, 300);
}

function rankContactsSheet_(stats) {
  var sheet = ensureContactsSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return 'אנשי קשר: אין שורות';

  var scoreCol = CONTACTS_HEADERS.length + 1;
  ensureScoreHeaders_(sheet, scoreCol);

  var keys = sheet.getRange(2, CC_KEY, last - 1, 1).getValues();
  var rows = keys.map(function (k) {
    var phone = String(k[0]).replace(/\D/g, '');
    return scoreOf_(stats.contacts[phone], stats.maxContact, 'contact');
  });

  var n = writeScoresAndSort_(sheet, 2, CONTACTS_HEADERS.length, scoreCol, rows);

  // המיון מזיז ערכים בין תאים, אז הגלישה מוחלת מחדש על העמודות הארוכות.
  sheet.getRange(2, CC_SUMMARY, n, 1).setWrap(true);
  sheet.getRange(2, CC_CHANGELOG, n, 1).setWrap(true);

  return 'אנשי קשר: ' + n + ' שורות';
}

function rankMainSheet_(stats) {
  var sheet = getMainSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return 'שיחות: אין שורות';

  var scoreCol = HEADERS.length + 1;
  ensureScoreHeaders_(sheet, scoreCol);

  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var rows = values.map(function (r) {
    var label = String(r[COL_NAME - 1]).trim();
    var st = stats.chats[label];

    if (!st) {
      var groupId = String(r[COL_GROUP_ID - 1]).replace(/\s+/g, '');
      if (groupId) st = stats.byChatId[groupId.indexOf('@') !== -1 ? groupId : groupId + '@g.us'];
    }
    if (!st) {
      // שורת איש קשר: מגיעים לצ׳אט דרך המספר המנורמל.
      var phone = String(r[COL_PHONE - 1]).trim();
      if (phone) {
        var country = PropertiesService.getDocumentProperties().getProperty(PROP_COUNTRY) ||
          DEFAULT_COUNTRY;
        var digits = normalizePhone_(phone, country);
        if (digits) st = stats.byChatId[digits + '@c.us'];
      }
    }
    return scoreOf_(st, stats.maxChat, 'chat');
  });

  var n = writeScoresAndSort_(sheet, 2, HEADERS.length, scoreCol, rows);
  return 'שיחות: ' + n + ' שורות';
}

function rankGroupsSheet_(stats) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(GROUPS_SHEET);
  if (!sheet) return 'קבוצות: הלשונית לא קיימת';

  var last = sheet.getLastRow();
  if (last < 2) return 'קבוצות: אין שורות';

  var scoreCol = GROUPS_COL_SCORE;
  ensureScoreHeaders_(sheet, scoreCol);
  ensureGroupsButtons_(sheet);

  var values = sheet.getRange(2, 1, last - 1, 3).getValues();
  var rows = values.map(function (r) {
    var st = stats.byChatId[String(r[2]).trim()];
    if (!st) st = stats.chats[String(r[0]).trim()];
    return scoreOf_(st, stats.maxChat, 'chat');
  });

  // רוחב המיון כולל את תיבת הסימון והסטטוס, אחרת הם היו נשארים במקומם
  // בזמן שהשמות זזים — וכל סטטוס היה מתייחס לקבוצה אחרת.
  var n = writeScoresAndSort_(sheet, 2, GROUPS_TOTAL_COLS, scoreCol, rows);
  ensureGroupsButtons_(sheet);
  return 'קבוצות: ' + n + ' שורות';
}
