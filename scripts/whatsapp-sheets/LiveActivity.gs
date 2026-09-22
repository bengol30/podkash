/**
 * פעילות חיה מווטסאפ, לא מהגיליון.
 *
 * הדירוג שמבוסס על לשוניות השיחה רואה רק מה שחילצת. כאן שואבים את המצב
 * האמיתי: Green API מחזיר את יומן ההודעות של *כל* השיחות בשתי קריאות
 * (נכנסות ויוצאות), ואת רשימת הצ׳אטים המלאה בקריאה שלישית. מזה נבנית
 * תמונה של כל מה שקורה בווטסאפ המחובר כרגע, כולל שיחות שמעולם לא חילצת.
 */

var ALL_CHATS_SHEET = 'כל השיחות';
var PROP_LIVE_WINDOW_DAYS = 'LIVE_WINDOW_DAYS';
var DEFAULT_LIVE_WINDOW_DAYS = 30;

var ALL_CHATS_HEADERS = [
  'ציון',
  'שם',
  'טלפון',
  'chatId',
  'הודעות',
  'ימים פעילים',
  'נכנסות',
  'יוצאות',
  'הודעה אחרונה',
  'מגמה',
  'פירוט'
];

/* =========================== נקודת כניסה =========================== */

function syncLiveActivity() {
  var cfg;
  try {
    cfg = getConfig_();
  } catch (err) {
    alert_('שגיאה: ' + err.message);
    return;
  }

  var days = getLiveWindowDays_();
  var minutes = days * 24 * 60;

  var journal;
  try {
    journal = fetchJournal_(cfg, minutes);
  } catch (err) {
    alert_('שגיאה במשיכת היומן: ' + err.message);
    return;
  }

  if (!journal.entries.length) {
    alert_(
      'Green API לא החזיר הודעות ל-' + days + ' הימים האחרונים.\n\n' +
        'היומן של Green API נשמר לתקופה מוגבלת, ולעיתים מוגבל גם לפי התוכנית. ' +
        'נסו חלון קצר יותר: ווטסאפ ← הגדרת חלון הפעילות.'
    );
    return;
  }

  var roster = fetchChatRoster_(cfg);
  var built = buildLiveStats_(journal);
  var written = writeAllChatsSheet_(built, roster, journal);

  var adapter = liveStatsAdapter_(built, roster);

  syncGroupsRosterInto_(roster);
  applyLiveScoresToContacts_(built);

  var ranked = [rankGroupsSheet_(adapter), rankMainSheet_(adapter)].join('\n');

  alert_(
    'סונכרן מווטסאפ.\n\n' +
      'שיחות פרטיות: ' + written.written + '\n' +
      (written.skipped
        ? 'הושמטו ' + written.skipped + ' אנשי קשר בלי פעילות בחלון\n'
        : '') +
      ranked + '\n' +
      'הודעות ביומן: ' + journal.entries.length + '\n' +
      'היומן כיסה בפועל: ' + journal.coveredDays + ' ימים\n' +
      (journal.coveredDays < days - 1
        ? '\nביקשנו ' + days + ' ימים וקיבלנו פחות — זו מגבלת היומן של Green API, לא באג.'
        : '')
  );
}

function setupLiveWindow() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    'חלון הפעילות',
    'על כמה ימים אחורה לחשב רלוונטיות? (ברירת מחדל ' + DEFAULT_LIVE_WINDOW_DAYS + ')',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var days = parseInt(res.getResponseText().trim(), 10);
  if (!(days > 0)) {
    ui.alert('מספר לא תקין.');
    return;
  }

  PropertiesService.getDocumentProperties().setProperty(PROP_LIVE_WINDOW_DAYS, String(days));
  ui.alert('נשמר: ' + days + ' ימים.');
}

function getLiveWindowDays_() {
  var raw = PropertiesService.getDocumentProperties().getProperty(PROP_LIVE_WINDOW_DAYS);
  var days = parseInt(raw, 10);
  return days > 0 ? days : DEFAULT_LIVE_WINDOW_DAYS;
}

/* =========================== משיכה מ-Green API =========================== */

function fetchJournal_(cfg, minutes) {
  var entries = [];
  var errors = [];

  function pull(method, direction) {
    var data = callGreenApi_(cfg, method, null, 'minutes=' + minutes);
    if (!Array.isArray(data)) return;

    for (var i = 0; i < data.length; i++) {
      var msg = data[i] || {};
      if (!msg.timestamp || !msg.chatId) continue;
      entries.push({
        chatId: String(msg.chatId),
        senderId: String(msg.senderId || ''),
        senderName: String(msg.senderName || msg.chatName || ''),
        chatName: String(msg.chatName || ''),
        at: new Date(Number(msg.timestamp) * 1000),
        direction: direction
      });
    }
  }

  try {
    pull('lastIncomingMessages', 'in');
  } catch (err) {
    errors.push('lastIncomingMessages: ' + err.message);
  }
  try {
    pull('lastOutgoingMessages', 'out');
  } catch (err) {
    errors.push('lastOutgoingMessages: ' + err.message);
  }

  if (errors.length === 2) throw new Error(errors.join(' | '));

  var oldest = null;
  for (var e = 0; e < entries.length; e++) {
    if (!oldest || entries[e].at < oldest) oldest = entries[e].at;
  }

  return {
    entries: entries,
    oldest: oldest,
    coveredDays: oldest
      ? Math.max(1, Math.round((new Date().getTime() - oldest.getTime()) / 86400000))
      : 0,
    errors: errors
  };
}

/** רשימת כל הצ׳אטים כפי שהם בווטסאפ עכשיו, כולל כאלה בלי פעילות. */
function fetchChatRoster_(cfg) {
  var roster = {};

  function collect(list) {
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var id = String(item.id || item.chatId || '');
      if (!id) continue;
      roster[id] = {
        chatId: id,
        name: String(item.name || item.contactName || '').trim(),
        isGroup: id.indexOf('@g.us') !== -1
      };
    }
  }

  try {
    collect(callGreenApi_(cfg, 'getContacts', null));
  } catch (err) {
    Logger.log('getContacts: ' + err.message);
  }

  return roster;
}

/* =========================== חישוב =========================== */

function buildLiveStats_(journal) {
  // המגמה נמדדת בתוך מה שהיומן באמת כיסה: חצי מאוחר מול חצי מוקדם.
  // בלי זה, חלון שהוחזר קצר מהמבוקש היה נותן מגמה חסרת משמעות.
  var midpoint = journal.oldest
    ? new Date((journal.oldest.getTime() + new Date().getTime()) / 2)
    : new Date(0);

  var chats = {};
  var contacts = {};

  function blank() {
    return {
      messages: 0,
      prevMessages: 0,
      incoming: 0,
      outgoing: 0,
      lastAt: null,
      activeDays: {},
      chats: {},
      name: ''
    };
  }

  for (var i = 0; i < journal.entries.length; i++) {
    var entry = journal.entries[i];
    var dayKey = Utilities.formatDate(entry.at, 'Asia/Jerusalem', 'yyyy-MM-dd');
    var recent = entry.at >= midpoint;

    var chat = chats[entry.chatId] || (chats[entry.chatId] = blank());
    bump_(chat, entry, dayKey, recent);
    if (!chat.name && entry.chatName) chat.name = entry.chatName;

    if (entry.direction === 'in') {
      var phone = (entry.senderId || entry.chatId).replace(/@.*$/, '').replace(/\D/g, '');
      if (phone) {
        var contact = contacts[phone] || (contacts[phone] = blank());
        bump_(contact, entry, dayKey, recent);
        contact.chats[entry.chatId] = true;
        if (!contact.name && entry.senderName) contact.name = entry.senderName;
      }
    }
  }

  return {
    chats: chats,
    contacts: contacts,
    maxChat: maxMessages_(chats),
    maxContact: maxMessages_(contacts)
  };
}

function bump_(target, entry, dayKey, recent) {
  target.messages++;
  target.activeDays[dayKey] = true;
  if (entry.direction === 'out') target.outgoing++;
  else target.incoming++;
  if (!target.lastAt || entry.at > target.lastAt) target.lastAt = entry.at;
  if (!recent) target.prevMessages++;
}

/* =========================== כתיבה =========================== */

function writeAllChatsSheet_(built, roster, journal) {
  var sheet = getOrCreateSheet_(ALL_CHATS_SHEET);
  sheet.clear();

  sheet.getRange(1, 1, 1, 2).setValues([
    [
      'סונכרן',
      formatDate_(new Date()) + ' · יומן של ' + journal.coveredDays + ' ימים · ' +
        'שיחות פרטיות בלבד (קבוצות בלשונית "' + GROUPS_SHEET + '")'
    ]
  ]);
  sheet.getRange(1, 1).setFontWeight('bold');

  var headerRow = 3;
  sheet.getRange(headerRow, 1, 1, ALL_CHATS_HEADERS.length)
    .setValues([ALL_CHATS_HEADERS])
    .setFontWeight('bold')
    .setBackground('#128C7E')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(headerRow);

  // רק שיחות פרטיות. לקבוצות יש לשונית משלהן עם אותם ציונים, ובאותה
  // טבלה הן היו מציפות את אנשי הקשר בלי להוסיף מידע.
  //
  // getContacts מחזיר גם אנשי קשר מהפנקס שמעולם לא התכתבת איתם. שורות
  // בציון אפס אינן "שיחות", והן היו קוברות את הרשימה — אז הן מושמטות,
  // אלא אם הן כבר יעד חילוץ בגיליון הראשי.
  var keepAnyway = mainSheetPhones_();

  var ids = {};
  for (var id in built.chats) if (built.chats.hasOwnProperty(id)) ids[id] = true;
  for (var rid in roster) if (roster.hasOwnProperty(rid)) ids[rid] = true;

  var rows = [];
  var skipped = 0;

  for (var chatId in ids) {
    if (!ids.hasOwnProperty(chatId)) continue;
    if (chatId.indexOf('@g.us') !== -1) continue;

    var st = built.chats[chatId];
    var phone = chatId.replace(/@.*$/, '').replace(/\D/g, '');

    if ((!st || !st.messages) && !keepAnyway[phone]) {
      skipped++;
      continue;
    }

    var info = roster[chatId] || {};
    var scored = scoreOf_(st, built.maxChat, 'chat');

    rows.push([
      scored.score,
      info.name || (st && st.name) || phone,
      phone,
      chatId,
      st ? st.messages : 0,
      st ? countKeys_(st.activeDays) : 0,
      st ? st.incoming : 0,
      st ? st.outgoing : 0,
      st && st.lastAt ? st.lastAt : '',
      trendLabel_(st),
      scored.detail
    ]);
  }

  rows.sort(function (a, b) {
    return b[0] - a[0];
  });

  if (rows.length) {
    sheet.getRange(headerRow + 1, 1, rows.length, ALL_CHATS_HEADERS.length).setValues(rows);
    sheet.getRange(headerRow + 1, 1, rows.length, 1).setNumberFormat('0.0');
    sheet.getRange(headerRow + 1, 9, rows.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  }

  sheet.setColumnWidth(1, 70);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(9, 140);
  sheet.setColumnWidth(11, 300);

  return { written: rows.length, skipped: skipped };
}

/** מספרי הטלפון שכבר משמשים כיעדי חילוץ בגיליון הראשי. */
function mainSheetPhones_() {
  var phones = {};

  try {
    var main = getMainSheet_();
    var last = main.getLastRow();
    if (last < 2) return phones;

    var country = PropertiesService.getDocumentProperties().getProperty(PROP_COUNTRY) ||
      DEFAULT_COUNTRY;
    var values = main.getRange(2, COL_PHONE, last - 1, 1).getValues();

    for (var i = 0; i < values.length; i++) {
      var raw = String(values[i][0]).trim();
      if (!raw) continue;
      var digits = normalizePhone_(raw, country);
      if (digits) phones[digits] = true;
    }
  } catch (err) {
    Logger.log('mainSheetPhones_: ' + err.message);
  }

  return phones;
}

function trendLabel_(st) {
  if (!st || !st.messages) return '';
  var detail = scoreOf_(st, 1, 'chat').detail;
  if (detail.indexOf('עולה') !== -1) return 'עולה';
  if (detail.indexOf('דועך') !== -1) return 'דועך';
  if (detail.indexOf('חדש') !== -1) return 'חדש';
  return 'יציב';
}

/**
 * מחיל את הפעילות החיה על לשונית אנשי הקשר, כך שגם מי שמעולם לא חילצת
 * את השיחה איתו מקבל ציון אמיתי.
 */
function applyLiveScoresToContacts_(built) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(CONTACTS_SHEET);
  if (!sheet) return;

  var last = sheet.getLastRow();
  if (last < 2) return;

  var scoreCol = CONTACTS_HEADERS.length + 1;
  ensureScoreHeaders_(sheet, scoreCol);

  var keys = sheet.getRange(2, CC_KEY, last - 1, 1).getValues();
  var rows = keys.map(function (k) {
    var phone = String(k[0]).replace(/\D/g, '');
    return scoreOf_(built.contacts[phone], built.maxContact, 'contact');
  });

  var n = writeScoresAndSort_(sheet, 2, CONTACTS_HEADERS.length, scoreCol, rows);
  sheet.getRange(2, CC_SUMMARY, n, 1).setWrap(true);
  sheet.getRange(2, CC_CHANGELOG, n, 1).setWrap(true);
}


/* =========================== התאמה למדרגים הקיימים =========================== */

/**
 * המדרגים של Relevance.gs מצפים למפה לפי שם ולמפה לפי chatId. הנתונים
 * החיים ממופתחים ב-chatId בלבד, אז מוסיפים מפתוח לפי שם מתוך רשימת
 * הצ׳אטים — וכך אותן פונקציות מיון משרתות את שני המקורות.
 */
function liveStatsAdapter_(built, roster) {
  var byName = {};

  for (var id in built.chats) {
    if (!built.chats.hasOwnProperty(id)) continue;
    var info = roster[id];
    var name = info && info.name ? info.name.trim() : (built.chats[id].name || '').trim();
    if (name && !byName[name]) byName[name] = built.chats[id];
  }

  return {
    chats: byName,
    byChatId: built.chats,
    contacts: built.contacts,
    maxChat: built.maxChat,
    maxContact: built.maxContact,
    chatCount: countKeys_(built.chats)
  };
}

/**
 * מוסיף ללשונית הקבוצות קבוצות שהופיעו בווטסאפ ועדיין אינן שם.
 * שורות קיימות נשארות — ייתכן שהוזן בהן id ידנית.
 */
function syncGroupsRosterInto_(roster) {
  var sheet = getOrCreateSheet_(GROUPS_SHEET);

  if (sheet.getLastRow() < 1 || String(sheet.getRange(1, 1).getValue()).trim() !== 'שם הקבוצה') {
    sheet.getRange(1, 1, 1, 3)
      .setValues([['שם הקבוצה', 'id של קבוצה', 'chatId מלא']])
      .setFontWeight('bold')
      .setBackground('#25D366')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  var known = {};
  var last = sheet.getLastRow();
  if (last > 1) {
    var existing = sheet.getRange(2, 3, last - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      var id = String(existing[i][0]).trim();
      if (id) known[id] = true;
    }
  }

  var additions = [];
  for (var chatId in roster) {
    if (!roster.hasOwnProperty(chatId)) continue;
    if (!roster[chatId].isGroup) continue;
    if (known[chatId]) continue;
    additions.push([roster[chatId].name, chatId.replace('@g.us', ''), chatId]);
  }

  if (additions.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 3).setValues(additions);
  }

  ensureGroupsButtons_(sheet);
  return additions.length;
}
