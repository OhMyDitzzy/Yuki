/**
 * Database Initializer Module
 * Handles all database initialization logic
 */

import { StaffRole } from "./role-system";

const isNumber = (x: number) => typeof x === 'number' && !isNaN(x);

export function initializeUser(user: any, sender: string, m: any): void {
  user = global.db.data.users[sender]
  if (typeof user !== 'object') global.db.data.users[sender] = {};
  if (user) {
    if (!isNumber(user.exp)) user.exp = 0;
    if (!isNumber(user.limit)) user.limit = 100;
    if (!isNumber(user.level)) user.level = 1;
    if (!('registered' in user)) user.registered = false;
    if (!user.registered) {
      if (!('name' in user)) user.name = m.name;
      if (!isNumber(user.age)) user.age = -1;
      if (!isNumber(user.regTime)) user.regTime = -1;
      if (!isNumber(user.limit)) user.limit = 50;
    }
    if (!isNumber(user.afk)) user.afk = -1;
    if (!('afkReason' in user)) user.afkReason = '';
    if (!('banned' in user)) user.banned = false;
    if (!('bannedReason' in user)) user.bannedReason = '';
    if (!('premium' in user)) user.premium = false;
    if (!isNumber(user.premiumDate)) user.premiumDate = 0;
    if (!('autolevelup' in user)) user.autolevelup = true;
    if (!('role' in user)) user.role = 'Beginner';
    if (!('moderator' in user)) user.moderator = false;
    if (!('staffRole' in user)) user.staffRole = null;

    if (!isNumber(user.prestige)) user.prestige = 0;
  } else global.db.data.users[sender] = {
    exp: 0,
    limit: 50,
    level: 1,
    registered: false,
    name: m.name,
    age: -1,
    regTime: -1,
    afk: -1,
    banned: false,
    bannedReason: '',
    premium: false,
    premiumDate: 0,
    autolevelup: true,
    role: 'Beginner',
    moderator: false,
    staffRole: null,
    prestige: 0,
  }
}

export function initializeChat(chat: any, chatId: string): void {
  chat = global.db.data.chats[chatId]
  if (typeof chat !== 'object') global.db.data.chats[chatId] = {}
  if (chat) {
    if (!('isBanned' in chat)) chat.isBanned = false
    if (!('welcome' in chat)) chat.welcome = true
    if (!('autoread' in chat)) chat.autoread = false
    if (!('detect' in chat)) chat.detect = false
    if (!('sWelcome' in chat)) chat.sWelcome = `Selamat Datang @user`
    if (!('sBye' in chat)) chat.sBye = `Selamat Tinggal @user`
    if (!('sPromote' in chat)) chat.sPromote = '@user telah di promote'
    if (!('sDemote' in chat)) chat.sDemote = '@user telah di demote'
    if (!('delete' in chat)) chat.delete = true
    if (!('antiVirtex' in chat)) chat.antiVirtex = false
    if (!('antiLink' in chat)) chat.antiLink = false
    if (!('tikauto' in chat)) chat.tikauto = false
    if (!('captcha' in chat)) chat.captcha = false
    if (!('antifoto' in chat)) chat.antiFoto = false
    if (!('antividio' in chat)) chat.antiVideo = false
    if (!('autoJpm' in chat)) chat.autoJpm = false
    if (!('antiPorn' in chat)) chat.antiPorn = false
    if (!('antiPorn' in chat)) chat.detect = false
    if (!('antiBot' in chat)) chat.antiBot = true
    if (!('antiSpam' in chat)) chat.antiSpam = false
    if (!('freply' in chat)) chat.freply = false
    if (!('simi' in chat)) chat.simi = false
    if (!('ai' in chat)) chat.ai = false
    if (!('ngetik' in chat)) chat.ngetik = true
    if (!('autoVn' in chat)) chat.autoVn = false
    if (!('antiSticker' in chat)) chat.antiSticker = false
    if (!('stiker' in chat)) chat.stiker = false
    if (!('antiBadword' in chat)) chat.antiBadword = false
    if (!('antiToxic' in chat)) chat.antiToxic = false
    if (!('viewonce' in chat)) chat.viewonce = false
    if (!('useDocument' in chat)) chat.useDocument = false
    if (!('antiToxic' in chat)) chat.antiToxic = false
    if (!isNumber(chat.expired)) chat.expired = 0
  } else global.db.data.chats[chatId] = {
    isBanned: false,
    welcome: true,
    autoread: false,
    simi: false,
    ai: false,
    ngetik: true,
    autoVn: false,
    stiker: false,
    antiSticker: false,
    antiBadword: false,
    antiToxic: false,
    antiSpam: false,
    detect: false,
    antiBot: true,
    detect: false,
    autoJpm: false,
    sWelcome: '',
    sBye: '',
    sPromote: '@user telah di promote!',
    sDemote: '@user telah di demote',
    delete: true,
    antiLink: false,
    tikauto: false,
    captcha: false,
    antifoto: false,
    antividio: false,
    antiPorn: false
  }
}

/**
 * Initialize bot settings with default values
 */
export function initializeSettings(settings: any, botJid: string): void {
  settings = global.db.data.settings[botJid]
  if (typeof settings !== 'object') global.db.data.settings[botJid] = {}
  if (settings) {
    if (!('self' in settings)) settings.self = false
    if (!('autoread' in settings)) settings.autoread = false
    if (!('composing' in settings)) settings.composing = true
    if (!('restrict' in settings)) settings.restrict = true
    if (!('autorestart' in settings)) settings.autorestart = true
    if (!('gconly' in settings)) settings.gconly = true
    if (!('restartDB' in settings)) settings.restartDB = 0
    if (!isNumber(settings.status)) settings.status = 0
    if (!('anticall' in settings)) settings.anticall = true
    if (!('clear' in settings)) settings.clear = true
    if (!isNumber(settings.clearTime)) settings.clearTime = 0
    if (!('freply' in settings)) settings.freply = true
    if (!('akinator' in settings)) settings.akinator = {}
  } else global.db.data.settings[botJid] = {
    self: false,
    autoread: false,
    restrict: true,
    autorestart: true,
    composing: true,
    restartDB: 0,
    gconly: true,
    status: 0,
    anticall: true,
    clear: true,
    clearTime: 0,
    freply: true,
    akinator: {}
  }
}

/**
 * Main database initialization
 * Call this once in handler
 */
export function initializeDatabase(m: any, botJid: string): void {
  try {
    let user = global.db.data.users[m.sender];
    initializeUser(user, m.sender, m);

    let chat = global.db.data.chats[m.chat];
    initializeChat(chat, m.chat);

    let settings = global.db.data.settings[botJid];
    initializeSettings(settings, botJid);
  } catch (e) {
    console.error('Database initialization error:', e);
  }
}
