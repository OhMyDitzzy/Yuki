import { WAMessageStubType, proto } from 'baileys';
import urlRegexSafe from 'url-regex-safe';
import PhoneNumber from 'awesome-phonenumber';
import chalk from 'chalk';
import { readFileSync, watchFile, unwatchFile } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { ExtendedWAMessage } from '../types/extendWAMessage';
import type { ExtendedWASocket } from './store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const urlRegex = urlRegexSafe({ strict: false });
let pkg: { version: string };

try {
  pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
} catch {
  pkg = { version: '0.0.0' };
}

export default async function print(m: ExtendedWAMessage, conn: any, _user?: any) {
  const _name = await conn.getName(m.sender);
  const senderJid = await conn.getJid(m.sender);
  const sender = PhoneNumber('+' + senderJid.replace('@s.whatsapp.net', '')).getNumber('international') + (_name ? ' ~' + _name : '');
  const chat = await conn.getName(m.chat);

  const filesize = (m.msg ?
    m.msg.vcard ?
      m.msg.vcard.length :
      m.msg.fileLength ?
        m.msg.fileLength.low || m.msg.fileLength :
        m.msg.axolotlSenderKeyDistributionMessage ?
          m.msg.axolotlSenderKeyDistributionMessage.length :
          m.text ?
            m.text.length :
            0
    : m.text ? m.text.length : 0) || 0;

  const user = global.db.data.users[sender] || global.db.data.users[m.sender];
  const me = PhoneNumber('+' + (await conn.getJid(conn.user.id) || '').replace('@s.whatsapp.net', '')).getNumber('international');

  console.log(`
╭┈❲ ${chalk.redBright('%s')}
│⏰ ${chalk.black(chalk.bgYellow('%s'))}
╞❴ Message ❵ ${chalk.black(chalk.bgGreen('%s'))}
╞❴ Size ❵ ${chalk.magenta('%s [%s %sB]')}
╞❴ From ❵ ${chalk.green('%s')}
╞❴ Other ❵ ${chalk.yellow('%s%s')}
╞❴ In chat ❵ ${chalk.green('%s')}
╞❴ Chat ❵ ${chalk.black(chalk.bgYellow('%s'))}
╰╼┈⟐ ❰ Yuki Botz V${pkg.version} ❱
`.trim(),
    me + ' ~' + (conn.user?.name || ''),
    (m.messageTimestamp ? new Date(1000 * (typeof m.messageTimestamp === 'number' ? m.messageTimestamp : m.messageTimestamp.low)) : new Date()).toTimeString(),
    m.messageStubType ? WAMessageStubType[m.messageStubType] : '',
    filesize,
    filesize === 0 ? 0 : (filesize / 1009 ** Math.floor(Math.log(filesize) / Math.log(1000))).toFixed(1),
    ['', ...'KMGTP'][Math.floor(Math.log(filesize) / Math.log(1000))] || '',
    sender,
    m.exp ?? '?',
    user ? '|' + user.exp + '|' + user.limit : '' + (user ? '|' + user.level : ''),
    m.chat + (chat ? ' ~' + chat : ''),
    m.mtype ? m.mtype.replace(/message$/i, '').replace('audio', m.msg?.ptt ? 'PTT' : 'audio').replace(/^./, v => v.toUpperCase()) : ''
  );

  if (typeof m.text === 'string' && m.text) {
    let log = m.text.replace(/\u200e+/g, '');
    const mdRegex = /(?<=(?:^|[\s\n])\S?)(?:([*_~])(.+?)\1|```((?:.||[\n\r])+?)```)(?=\S?(?:[\s\n]|$))/g;

    const mdFormat = (depth = 4) => (_: string, type: string, text: string, monospace: string): string => {
      const types: Record<string, string> = {
        '_': 'italic',
        '*': 'bold',
        '~': 'strikethrough'
      };
      text = text || monospace;
      const formatted = !types[type] || depth < 1 ? text : (chalk as any)[types[type]](text.replace(mdRegex, mdFormat(depth - 1)));
      return formatted;
    };

    if (log.length < 4096) {
      log = log.replace(urlRegex, (url: string, i: number, text: string) => {
        const end = url.length + i;
        return i === 0 || end === text.length || (/^\s$/.test(text[end]!!) && /^\s$/.test(text[i - 1]!!)) ? chalk.blueBright(url) : url;
      });
    }

    log = log.replace(mdRegex, mdFormat(4));

    if (m.mentionedJid) {
      for (const user of m.mentionedJid) {
        log = log.replace('@' + user.split('@')[0], chalk.blueBright('@' + await conn.getName(user)));
      }
    }

    console.log(m.error != null ? chalk.red(log) : m.isCommand ? chalk.yellow(log) : log);
  }

  if (m.messageStubParameters) {
    console.log(m.messageStubParameters.map(jid => {
      jid = conn.decodeJid(jid);
      const name = conn.getName(jid);
      return chalk.gray(PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international') + (name ? ' ~' + name : ''));
    }).join(', '));
  }

  if (/document/i.test(m.mtype || '')) {
    console.log(`📄 ${m.msg?.filename || m.msg?.displayName || 'Document'}`);
  } else if (/ContactsArray/i.test(m.mtype || '')) {
    // @ts-ignore
    console.log(`👨‍👩‍👧‍👦 ${' ' || ''}`);
  } else if (/contact/i.test(m.mtype || '')) {
    console.log(`👨 ${m.msg?.displayName || ''}`);
  } else if (/audio/i.test(m.mtype || '')) {
    const s = m.msg?.seconds || 0;
    console.log(`${m.msg?.ptt ? '🎤 (PTT ' : '🎵 ('}AUDIO) ${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`);
  }

  console.log();
}

if (!global.__print_watched) {
  global.__print_watched = true;
  
  watchFile(__filename, () => {
    unwatchFile(__filename);
    delete global.__print_watched;
    console.log(chalk.redBright("Update 'lib/print.ts'"));
  });
}