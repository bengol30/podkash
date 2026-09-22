/**
 * חילוץ היסטוריית ווטסאפ לגוגל שיטס דרך GREEN API.
 *
 * הגיליון הראשי מכיל שורה לכל יעד:
 *   A - שם הקבוצה / איש הקשר
 *   B - טלפון (לאיש קשר בלבד)
 *   C - id של קבוצה (מתמלא אוטומטית לפי שם הקבוצה)
 *   D - הסטוריה (קישור ללשונית עם ההודעות)
 *   E - סטטוס
 *   F - עודכן
 *
 * אם יש טלפון -> מושכים לפי המספר (chatId = <מספר>@c.us).
 * אם אין טלפון -> מחפשים קבוצה לפי השם, כותבים את ה-id שלה בעמודה C
 * ומושכים לפי <id>@g.us.
 */

/* =========================== קבועים =========================== */

var HEADERS = [
  'שם הקבוצהֿ איש הקשר',
  'טלפון',
  'id של קבוצה',
  'הסטוריה',
  'סטטוס',
  'עודכן'
];

var COL_NAME = 1;
var COL_PHONE = 2;
var COL_GROUP_ID = 3;
var COL_HISTORY = 4;
var COL_STATUS = 5;
var COL_UPDATED = 6;

var GROUPS_SHEET = 'קבוצות';
var LOG_SHEET = 'לוג';
var CHAT_SHEET_PREFIX = 'שיחה · ';

var PROP_ID_INSTANCE = 'GREENAPI_ID_INSTANCE';
var PROP_TOKEN = 'GREENAPI_API_TOKEN';
var PROP_API_URL = 'GREENAPI_API_URL';
var PROP_COUNT = 'GREENAPI_MESSAGE_COUNT';
var PROP_COUNTRY = 'GREENAPI_COUNTRY_CODE';

var DEFAULT_COUNT = 100;
var DEFAULT_COUNTRY = '972';
var REQUEST_PAUSE_MS = 1200;

var CHAT_HEADERS = [
  '#',
  'תאריך ושעה',
  'כיוון',
  'שולח',
  'מספר השולח',
  'סוג',
  'טקסט',
  'קובץ / מדיה',
  'מזהה הודעה'
];

/* =========================== תפריט =========================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ווטסאפ')
    .addItem('1. הגדרת Green API', 'setupCredentials')
    .addItem('2. בדיקת חיבור', 'testConnection')
    .addSeparator()
    .addItem('3. רענון רשימת הקבוצות', 'refreshGroups')
    .addSeparator()
    .addItem('משיכת היסטוריה — השורה הנוכחית', 'extractCurrentRow')
    .addItem('משיכת היסטוריה — כל השורות', 'extractAllRows')
    .addSeparator()
    .addItem('אתחול מבנה הגיליון', 'initSheet')
    .addToUi();
}

/* =========================== עזר =========================== */

/** alert שלא מפיל הרצה מתוך טריגר מתוזמן (שם אין UI). */
function alert_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (err) {
    Logger.log(message);
  }
}

/* =========================== הגדרות =========================== */

function setupCredentials() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getDocumentProperties();

  var idRes = ui.prompt(
    'Green API — idInstance',
    'הדביקו את ה-idInstance מהאזור האישי של Green API:',
    ui.ButtonSet.OK_CANCEL
  );
  if (idRes.getSelectedButton() !== ui.Button.OK) return;
  var idInstance = idRes.getResponseText().trim();
  if (!idInstance) {
    ui.alert('לא הוזן idInstance.');
    return;
  }

  var tokenRes = ui.prompt(
    'Green API — apiTokenInstance',
    'הדביקו את ה-apiTokenInstance:',
    ui.ButtonSet.OK_CANCEL
  );
  if (tokenRes.getSelectedButton() !== ui.Button.OK) return;
  var token = tokenRes.getResponseText().trim();
  if (!token) {
    ui.alert('לא הוזן apiTokenInstance.');
    return;
  }

  var countRes = ui.prompt(
    'כמות הודעות',
    'כמה הודעות אחרונות למשוך לכל שיחה? (ברירת מחדל 100)',
    ui.ButtonSet.OK_CANCEL
  );
  var count = DEFAULT_COUNT;
  if (countRes.getSelectedButton() === ui.Button.OK) {
    var parsed = parseInt(countRes.getResponseText().trim(), 10);
    if (parsed > 0) count = parsed;
  }

  props.setProperty(PROP_ID_INSTANCE, idInstance);
  props.setProperty(PROP_TOKEN, token);
  props.setProperty(PROP_COUNT, String(count));
  if (!props.getProperty(PROP_COUNTRY)) {
    props.setProperty(PROP_COUNTRY, DEFAULT_COUNTRY);
  }

  ui.alert('נשמר. עכשיו אפשר להריץ "בדיקת חיבור".');
}

function getConfig_() {
  var props = PropertiesService.getDocumentProperties();
  var idInstance = props.getProperty(PROP_ID_INSTANCE);
  var token = props.getProperty(PROP_TOKEN);

  if (!idInstance || !token) {
    throw new Error('חסרות הגדרות Green API. הריצו קודם: ווטסאפ ← הגדרת Green API.');
  }

  var apiUrl = props.getProperty(PROP_API_URL);
  if (!apiUrl) {
    // מופעים חדשים מקבלים host ייעודי לפי 4 הספרות הראשונות של ה-idInstance.
    apiUrl = 'https://' + String(idInstance).substring(0, 4) + '.api.greenapi.com';
  }

  var count = parseInt(props.getProperty(PROP_COUNT), 10);
  if (!(count > 0)) count = DEFAULT_COUNT;

  return {
    idInstance: idInstance,
    token: token,
    apiUrl: String(apiUrl).replace(/\/+$/, ''),
    count: count,
    countryCode: props.getProperty(PROP_COUNTRY) || DEFAULT_COUNTRY
  };
}

/* =========================== קריאות ל-Green API =========================== */

function callGreenApi_(cfg, method, payload) {
  var url = cfg.apiUrl + '/waInstance' + cfg.idInstance + '/' + method + '/' + cfg.token;

  var options = {
    method: payload ? 'post' : 'get',
    muteHttpExceptions: true,
    contentType: 'application/json'
  };
  if (payload) options.payload = JSON.stringify(payload);

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code === 401 || code === 403) {
    throw new Error('Green API החזיר ' + code + ' — ה-idInstance או ה-token שגויים.');
  }
  if (code === 429) {
    throw new Error('Green API החזיר 429 — חריגה ממכסת הקריאות. נסו שוב בעוד דקה.');
  }
  if (code >= 400) {
    throw new Error('Green API החזיר ' + code + ': ' + body.substring(0, 500));
  }

  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error('תשובה לא תקינה מ-Green API: ' + body.substring(0, 300));
  }
}

function testConnection() {
  var ui = SpreadsheetApp.getUi();
  try {
    var cfg = getConfig_();
    var state = callGreenApi_(cfg, 'getStateInstance', null);
    var stateName = state && state.stateInstance ? state.stateInstance : JSON.stringify(state);

    if (stateName === 'authorized') {
      ui.alert('החיבור תקין ✅\nמצב המופע: authorized\nכתובת API: ' + cfg.apiUrl);
    } else {
      ui.alert(
        'החיבור עובד, אבל המופע אינו מחובר לווטסאפ.\nמצב: ' +
          stateName +
          '\nסרקו מחדש את ה-QR באזור האישי של Green API.'
      );
    }
  } catch (err) {
    ui.alert('שגיאה: ' + err.message);
  }
}

/* =========================== מבנה הגיליון =========================== */

function initSheet() {
  var sheet = getMainSheet_();
  var range = sheet.getRange(1, 1, 1, HEADERS.length);
  range.setValues([HEADERS]);
  range.setFontWeight('bold').setBackground('#25D366').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(COL_NAME, 200);
  sheet.setColumnWidth(COL_PHONE, 130);
  sheet.setColumnWidth(COL_GROUP_ID, 220);
  sheet.setColumnWidth(COL_HISTORY, 160);
  sheet.setColumnWidth(COL_STATUS, 220);
  sheet.setColumnWidth(COL_UPDATED, 150);
  sheet.getRange(1, COL_PHONE, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(1, COL_GROUP_ID, sheet.getMaxRows(), 1).setNumberFormat('@');
  SpreadsheetApp.getActive().setSpreadsheetTimeZone('Asia/Jerusalem');
  alert_('מבנה הגיליון עודכן.');
}

function getMainSheet_() {
  return SpreadsheetApp.getActive().getSheets()[0];
}

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

/* =========================== קבוצות =========================== */

function refreshGroups() {
  var ui = SpreadsheetApp.getUi();
  try {
    var cfg = getConfig_();
    var groups = fetchGroups_(cfg);

    var sheet = getOrCreateSheet_(GROUPS_SHEET);
    sheet.clear();
    sheet.getRange(1, 1, 1, 3)
      .setValues([['שם הקבוצה', 'id של קבוצה', 'chatId מלא']])
      .setFontWeight('bold')
      .setBackground('#25D366')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);

    if (groups.length) {
      var rows = groups.map(function (g) {
        return [g.name, g.shortId, g.chatId];
      });
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    sheet.setColumnWidth(1, 260);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 240);

    ui.alert('נמצאו ' + groups.length + ' קבוצות. הרשימה נשמרה בלשונית "' + GROUPS_SHEET + '".');
  } catch (err) {
    ui.alert('שגיאה: ' + err.message);
  }
}

function fetchGroups_(cfg) {
  var found = {};

  function collect(list) {
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var id = item.id || item.chatId;
      if (!id || String(id).indexOf('@g.us') === -1) continue;
      var name = item.name || item.contactName || item.subject || '';
      var chatId = String(id);
      found[chatId] = {
        name: String(name).trim(),
        chatId: chatId,
        shortId: chatId.replace('@g.us', '')
      };
    }
  }

  try {
    collect(callGreenApi_(cfg, 'getContacts', null));
  } catch (err) {
    Logger.log('getContacts נכשל: ' + err.message);
  }

  try {
    collect(callGreenApi_(cfg, 'getChats', null));
  } catch (err) {
    Logger.log('getChats נכשל: ' + err.message);
  }

  var out = [];
  for (var key in found) {
    if (Object.prototype.hasOwnProperty.call(found, key)) out.push(found[key]);
  }
  out.sort(function (a, b) {
    return a.name.localeCompare(b.name, 'he');
  });
  return out;
}

function getGroupsIndex_(cfg, forceRefresh) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(GROUPS_SHEET);
  var rows = [];

  if (!forceRefresh && sheet && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    rows = values
      .filter(function (r) {
        return r[0] || r[2];
      })
      .map(function (r) {
        return { name: String(r[0]), shortId: String(r[1]), chatId: String(r[2]) };
      });
  }

  if (!rows.length) {
    rows = fetchGroups_(cfg);
    var target = getOrCreateSheet_(GROUPS_SHEET);
    target.clear();
    target.getRange(1, 1, 1, 3)
      .setValues([['שם הקבוצה', 'id של קבוצה', 'chatId מלא']])
      .setFontWeight('bold');
    if (rows.length) {
      target.getRange(2, 1, rows.length, 3).setValues(
        rows.map(function (g) {
          return [g.name, g.shortId, g.chatId];
        })
      );
    }
  }

  return rows;
}

function findGroupByName_(groups, name) {
  var needle = normalizeText_(name);
  if (!needle) return null;

  var exact = groups.filter(function (g) {
    return normalizeText_(g.name) === needle;
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error('נמצאו ' + exact.length + ' קבוצות בשם "' + name + '". הזינו ידנית את ה-id בעמודה C.');
  }

  var partial = groups.filter(function (g) {
    return normalizeText_(g.name).indexOf(needle) !== -1;
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    var names = partial
      .slice(0, 5)
      .map(function (g) {
        return g.name;
      })
      .join(' | ');
    throw new Error('השם "' + name + '" מתאים לכמה קבוצות: ' + names + '. דייקו את השם.');
  }

  return null;
}

function normalizeText_(value) {
  return String(value == null ? '' : value)
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* =========================== נרמול מספרי טלפון =========================== */

function normalizePhone_(raw, countryCode) {
  var digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (!digits) return '';

  if (digits.indexOf('00') === 0) digits = digits.substring(2);

  var cc = String(countryCode || DEFAULT_COUNTRY);

  if (digits.indexOf(cc) === 0 && digits.length > cc.length + 6) return digits;
  if (digits.charAt(0) === '0') return cc + digits.substring(1);
  if (digits.length <= 10) return cc + digits;

  return digits;
}

/* =========================== חילוץ היסטוריה =========================== */

function extractCurrentRow() {
  var sheet = getMainSheet_();
  var row = sheet.getActiveRange() ? sheet.getActiveRange().getRow() : 0;
  if (row < 2) {
    alert_('בחרו שורה עם איש קשר או קבוצה (משורה 2 ומטה).');
    return;
  }
  runExtraction_([row]);
}

function extractAllRows() {
  var sheet = getMainSheet_();
  var last = sheet.getLastRow();
  if (last < 2) {
    alert_('אין שורות למשיכה. מלאו שם או טלפון משורה 2 ומטה.');
    return;
  }
  var rows = [];
  for (var r = 2; r <= last; r++) rows.push(r);
  runExtraction_(rows);
}

function runExtraction_(rowNumbers) {
  var cfg;
  try {
    cfg = getConfig_();
  } catch (err) {
    alert_('שגיאה: ' + err.message);
    return;
  }

  var sheet = getMainSheet_();
  var groups = null;
  var ok = 0;
  var failed = 0;
  var skipped = 0;

  for (var i = 0; i < rowNumbers.length; i++) {
    var row = rowNumbers[i];
    var name = String(sheet.getRange(row, COL_NAME).getValue()).trim();
    var phone = String(sheet.getRange(row, COL_PHONE).getValue()).trim();
    var groupId = String(sheet.getRange(row, COL_GROUP_ID).getValue()).trim();

    if (!name && !phone && !groupId) {
      skipped++;
      continue;
    }

    try {
      var target = resolveTarget_(cfg, {
        name: name,
        phone: phone,
        groupId: groupId,
        getGroups: function () {
          if (!groups) groups = getGroupsIndex_(cfg, false);
          return groups;
        }
      });

      if (target.groupShortId) {
        sheet.getRange(row, COL_GROUP_ID).setValue(target.groupShortId);
      }

      var messages = fetchChatHistory_(cfg, target.chatId, cfg.count);
      var label = name || target.chatId;
      var chatSheet = writeChatSheet_(label, target, messages);

      setHistoryLink_(sheet, row, chatSheet, messages.length);
      sheet.getRange(row, COL_STATUS)
        .setValue(messages.length ? target.kindLabel + ' · ' + messages.length + ' הודעות' : target.kindLabel + ' · אין הודעות');
      sheet.getRange(row, COL_UPDATED).setValue(new Date());
      logLine_('OK', label, target.chatId, messages.length + ' הודעות');
      ok++;
    } catch (err) {
      sheet.getRange(row, COL_STATUS).setValue('שגיאה: ' + err.message);
      sheet.getRange(row, COL_UPDATED).setValue(new Date());
      logLine_('ERROR', name || phone || groupId, '', err.message);
      failed++;
    }

    SpreadsheetApp.flush();
    if (i < rowNumbers.length - 1) Utilities.sleep(REQUEST_PAUSE_MS);
  }

  alert_('הסתיים.\nהצליחו: ' + ok + '\nנכשלו: ' + failed + '\nדולגו (שורות ריקות): ' + skipped);
}

function resolveTarget_(cfg, input) {
  // 1. id של קבוצה שהוזן ידנית או נשמר בהרצה קודמת.
  if (input.groupId) {
    var raw = input.groupId.replace(/\s+/g, '');
    var chatId = raw.indexOf('@') !== -1 ? raw : raw + '@g.us';
    return { chatId: chatId, kind: 'group', kindLabel: 'קבוצה', groupShortId: '' };
  }

  // 2. יש טלפון -> איש קשר.
  if (input.phone) {
    var digits = normalizePhone_(input.phone, cfg.countryCode);
    if (!digits) throw new Error('מספר טלפון לא תקין: ' + input.phone);
    return { chatId: digits + '@c.us', kind: 'contact', kindLabel: 'איש קשר', groupShortId: '' };
  }

  // 3. אין טלפון -> מחפשים קבוצה לפי השם.
  if (input.name) {
    var group = findGroupByName_(input.getGroups(), input.name);
    if (!group) {
      throw new Error(
        'לא נמצאה קבוצה בשם "' + input.name + '". הריצו "רענון רשימת הקבוצות" או הזינו טלפון בעמודה B.'
      );
    }
    return {
      chatId: group.chatId,
      kind: 'group',
      kindLabel: 'קבוצה',
      groupShortId: group.shortId
    };
  }

  throw new Error('שורה ללא שם וללא טלפון.');
}

function fetchChatHistory_(cfg, chatId, count) {
  var data = callGreenApi_(cfg, 'getChatHistory', { chatId: chatId, count: count });

  if (!data) return [];
  if (!Array.isArray(data)) {
    if (data.error || data.message) {
      throw new Error(String(data.error || data.message));
    }
    return [];
  }

  data.sort(function (a, b) {
    return (a.timestamp || 0) - (b.timestamp || 0);
  });

  return data.slice(-count);
}

/* =========================== כתיבת ההודעות =========================== */

function writeChatSheet_(label, target, messages) {
  var sheetName = buildChatSheetName_(label || target.chatId);
  var sheet = getOrCreateSheet_(sheetName);
  sheet.clear();

  sheet.getRange(1, 1, 1, 2).setValues([['שיחה', label]]);
  sheet.getRange(2, 1, 1, 2).setValues([['chatId', target.chatId]]);
  sheet.getRange(3, 1, 1, 2).setValues([['סוג', target.kindLabel]]);
  sheet.getRange(4, 1, 1, 2).setValues([['נמשך בתאריך', formatDate_(new Date())]]);
  sheet.getRange(1, 1, 4, 1).setFontWeight('bold');

  var headerRow = 6;
  sheet.getRange(headerRow, 1, 1, CHAT_HEADERS.length)
    .setValues([CHAT_HEADERS])
    .setFontWeight('bold')
    .setBackground('#25D366')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(headerRow);

  var rows = messages.map(function (msg, index) {
    var parsed = parseMessage_(msg);
    return [
      index + 1,
      parsed.date,
      parsed.direction,
      parsed.senderName,
      parsed.senderPhone,
      parsed.type,
      parsed.text,
      parsed.media,
      parsed.id
    ];
  });

  if (rows.length) {
    sheet.getRange(headerRow + 1, 1, rows.length, CHAT_HEADERS.length).setValues(rows);
    sheet.getRange(headerRow + 1, 7, rows.length, 1).setWrap(true);
  } else {
    sheet.getRange(headerRow + 1, 1).setValue('לא נמצאו הודעות בהיסטוריה עבור שיחה זו.');
  }

  sheet.setColumnWidth(1, 45);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 140);
  sheet.setColumnWidth(6, 130);
  sheet.setColumnWidth(7, 520);
  sheet.setColumnWidth(8, 260);
  sheet.setColumnWidth(9, 200);

  return sheet;
}

function buildChatSheetName_(label) {
  var clean = String(label).replace(/[\[\]\*\/\\\?:]/g, ' ').replace(/\s+/g, ' ').trim();
  var name = CHAT_SHEET_PREFIX + clean;
  if (name.length > 95) name = name.substring(0, 95);
  return name;
}

function parseMessage_(msg) {
  msg = msg || {};

  var direction = msg.type === 'outgoing' ? 'יוצאת' : msg.type === 'incoming' ? 'נכנסת' : String(msg.type || '');
  var typeMessage = msg.typeMessage || (msg.messageData && msg.messageData.typeMessage) || '';
  var data = msg.messageData || msg;

  var text = '';
  var media = '';

  var extended = data.extendedTextMessageData || data.extendedTextMessage || msg.extendedTextMessage;
  var file = data.fileMessageData || data.fileMessage;
  if (!file && (msg.downloadUrl || msg.fileName)) {
    file = {
      downloadUrl: msg.downloadUrl,
      fileName: msg.fileName,
      mimeType: msg.mimeType,
      caption: msg.caption
    };
  }
  var location = data.locationMessageData || data.locationMessage;
  var contact = data.contactMessageData || data.contactMessage;
  var poll = data.pollMessageData || data.pollMessage;
  var reaction = data.reactionMessageData || data.reactionMessage;
  var textData = data.textMessageData || data.textMessage;

  if (typeof textData === 'string') {
    text = textData;
  } else if (textData && textData.textMessage) {
    text = textData.textMessage;
  }

  if (!text && extended) {
    text = extended.text || extended.textMessage || extended.description || extended.title || '';
    if (extended.title && extended.text && extended.title !== extended.text) {
      text = extended.title + '\n' + text;
    }
  }

  if (!text && typeof msg.textMessage === 'string') text = msg.textMessage;
  if (!text && typeof msg.caption === 'string') text = msg.caption;

  if (file) {
    if (!text) text = file.caption || '';
    var parts = [];
    if (file.fileName) parts.push(file.fileName);
    if (file.downloadUrl) parts.push(file.downloadUrl);
    if (file.mimeType) parts.push(file.mimeType);
    media = parts.join(' | ');
  }

  if (!media && msg.downloadUrl) media = msg.downloadUrl;

  if (location) {
    text = text || [location.nameLocation, location.address].filter(Boolean).join(' — ');
    media = 'https://maps.google.com/?q=' + location.latitude + ',' + location.longitude;
  }

  if (contact) {
    text = text || ('איש קשר: ' + (contact.displayName || ''));
    media = media || String(contact.vcard || '').substring(0, 400);
  }

  if (poll) {
    var options = (poll.options || [])
      .map(function (o) {
        return o.optionName || o;
      })
      .join(' | ');
    text = text || ('סקר: ' + (poll.name || '') + (options ? ' [' + options + ']' : ''));
  }

  if (reaction) {
    text = text || ('תגובה: ' + (reaction.text || reaction.reaction || ''));
  }

  if (!text && data.quotedMessage) {
    text = data.quotedMessage.textMessage || data.quotedMessage.caption || '';
  }

  if (!text && !media) {
    text = '[' + (typeMessage || 'הודעה ללא טקסט') + ']';
  }

  var senderId = msg.senderId || msg.sender || '';
  if (!senderId && direction === 'נכנסת') senderId = msg.chatId || '';
  var senderPhone = String(senderId).replace(/@.*$/, '');

  return {
    date: msg.timestamp ? formatDate_(new Date(Number(msg.timestamp) * 1000)) : '',
    direction: direction,
    senderName: msg.senderName || msg.senderContactName || (direction === 'יוצאת' ? 'אני' : ''),
    senderPhone: senderPhone,
    type: typeMessage,
    text: String(text).substring(0, 45000),
    media: String(media).substring(0, 2000),
    id: msg.idMessage || ''
  };
}

function formatDate_(date) {
  return Utilities.formatDate(date, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm:ss');
}

function setHistoryLink_(sheet, row, chatSheet, count) {
  var url = SpreadsheetApp.getActive().getUrl() + '#gid=' + chatSheet.getSheetId();
  var label = count ? 'פתיחה (' + count + ')' : 'פתיחה (0)';
  var rich = SpreadsheetApp.newRichTextValue().setText(label).setLinkUrl(url).build();
  sheet.getRange(row, COL_HISTORY).setRichTextValue(rich);
}

/* =========================== לוג =========================== */

function logLine_(level, label, chatId, details) {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(LOG_SHEET);
    if (!sheet) {
      sheet = SpreadsheetApp.getActive().insertSheet(LOG_SHEET);
      sheet.getRange(1, 1, 1, 5)
        .setValues([['זמן', 'רמה', 'יעד', 'chatId', 'פירוט']])
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([formatDate_(new Date()), level, label, chatId, details]);
  } catch (err) {
    Logger.log('log failed: ' + err.message);
  }
}
