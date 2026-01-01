import type { BaileysEventMap } from "baileys"
import { smsg } from "./libs/serialize";
import type { ExtendedWAMessage } from "./types/extendWAMessage";
import util from "node:util";
import fs from "node:fs";
import { initializeDatabase } from "./libs/database-initializer";
import { assignStaffRole, StaffRole, updateUserRole } from "libs/role-system.ts";
import type { ExtendedWASocket } from "types/extendWASocket.ts";

const isNumber = (x: number) => typeof x === 'number' && !isNaN(x)
const delay = (ms: number) => isNumber(ms) && new Promise(resolve => setTimeout(resolve, ms))

export async function handler(chatUpdate: BaileysEventMap["messages.upsert"]) {
  this.msgqueque = this.msgqueque || []
  if (!chatUpdate) return;
  this.pushMessage(chatUpdate.messages).catch(console.error);
  let m = chatUpdate.messages[chatUpdate.messages.length - 1] as ExtendedWAMessage;
  if (!m) return;
  if (global.db.data == null) await loadDatabase();
  if (m.mtype === "templateButtonReplyMessage") this.appenTextMessage(m.msg.selectedId, chatUpdate)
  try {
    m = smsg(this, m) || m
    if (!m) return;
    m.exp = 0;
    m.limit = false;
    try {
      initializeDatabase(m, this.user.lid);
    } catch (e) {
      console.error(e)
    }
    if (opts["self"]) {
      m.exp = 0;
      m.limit = false;
    }
    if (opts["nyimak"]) return;
    if (opts["self"] && !m.fromMe && !global.db.data.users[m.sender].moderator) return
    if (opts["autoread"]) await this.readMessages([m.key]);
    if (opts["pconly"] && m.chat.endsWith('g.us')) return;
    if (opts["gconly"] && !m.fromMe && !m.chat.endsWith("g.us") && !global.db.data.users[m.sender].premium) return conn.sendMessage(m.chat, { text: `Bot Access to Private Chat Denied` }, { quoted: m });
    if (opts['swonly'] && m.chat !== 'status@broadcast') return;
    if (typeof m.text !== 'string') m.text = '';
    const body = typeof m.text == 'string' ? m.text : false;
    // if (!body || typeof body !== 'string' || body.length === 0) return;

    const senderLid = await this.getLid(m.sender)

    const ownerLids = await Promise.all([conn.decodeJid(this.user.id), ...global.owner.map(([number, _]) => number)].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').map(jid => this.getLid(jid)))

    const isROwner = ownerLids.includes(senderLid)
    const isOwner = isROwner || m.fromMe;
    const modsLids = await Promise.all(global.mods.map((v: any) => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').map((jid: string) => this.getLid(jid)))
    const isMods = isOwner || modsLids.includes(senderLid)
    const isPrems = isROwner || global.db.data.users[m.sender].premium;
    const isBans = global.db.data.users[m.sender].banned;

    if (isROwner) {
      global.db.data.users[m.sender].premium = true;
      global.db.data.users[m.sender].premiumDate = "infinity";
      global.db.data.users[m.sender].limit = "infinity";
      assignStaffRole(global.db.data.users[m.sender], StaffRole.OWNER)
    } else if (isMods) {
      assignStaffRole(global.db.data.users[m.sender], StaffRole.MODERATOR);
    }

    updateUserRole(global.db.data.users[m.sender], global.db.data.users[m.sender].level)

    if (opts['queque'] && m.text && !(isMods || isPrems)) {
      let queque = this.msgqueque, time = 1000 * 5
      const previousID = queque[queque.length - 1]
      queque.push(m.id || m.key.id)
      setInterval(async function() {
        if (queque.indexOf(previousID) === -1) clearInterval(this)
        else await delay(time)
      }, time)
    }

    if (m.isBaileys) return;
    m.exp += Math.ceil(Math.random() * 10);
    let usedPrefix: any
    let _user = global.db.data && global.db.data.users && global.db.data.users[m.sender]
    const groupMetadata = (m.isGroup ? (conn.chats[m.chat] || {}).metadata : {}) || {}
    const participants = (m.isGroup ? groupMetadata.participants : []) || []
    let user: any
    let bot: any

    user = participants.find(u => conn.decodeJid(u.id) === m.sender) || participants.find(u => u.id === senderLid)
    bot = participants.find(u => conn.decodeJid(u.id) === conn.user.jid) || participants.find(u => u.id === conn.user.lid)   

    const isRAdmin = user?.admin === 'superadmin'
    const isAdmin = isRAdmin || user?.admin === 'admin'
    const isBotAdmin = !!bot?.admin;

    const checkTarget = async (targetJid: string) => {
      if (!targetJid || !m.isGroup) return {
        targetROwner: false,
        targetMods: false,
        targetRAdmin: false,
        targetAdmin: false,
        targetUser: null
      }

      const targetLid = await this.getLid(targetJid)
      const targetROwner = ownerLids.includes(targetLid)
      const targetMods = targetROwner || modsLids.includes(targetLid)

      let targetUser: any = null
      for (const p of participants) {
        const lid = await this.getLid(p.id)
        if (lid === targetLid) {
          targetUser = p
          break
        }
      }

      const targetRAdmin = targetUser?.admin === 'superadmin'
      const targetAdmin = targetRAdmin || targetUser?.admin === 'admin'

      return {
        targetROwner,
        targetMods,
        targetRAdmin,
        targetAdmin,
        targetUser
      }
    }

    for (let name in global.plugins) {
      let plugin = global.plugins[name];
      if (!plugin) continue;      
      if (typeof plugin.all === "function") {
        try {
          await plugin.all.call(this, m, chatUpdate);
        } catch (e) {
          console.error(e)
        }
      }

      if (!opts['restrict']) if (plugin.tags && plugin.tags.includes('admin')) {
        continue
      }

      const str2Regex = (str: string) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
      let _prefix = plugin.customPrefix ? plugin.customPrefix : conn.prefix ? conn.prefix : global.prefix;
      const usePrefix = plugin.usePrefix !== false;
      let match: any;

      const prefixMatch = (_prefix instanceof RegExp ?
        [[_prefix.exec(m.text), _prefix]] :
        Array.isArray(_prefix) ?
          _prefix.map(p => {
            let re = p instanceof RegExp ?
              p :
              new RegExp(str2Regex(p))
            return [re.exec(m.text), re]
          }) :
          typeof _prefix === 'string' ?
            [[new RegExp(str2Regex(_prefix)).exec(m.text), new RegExp(str2Regex(_prefix))]] :
            // @ts-ignore
            [[[], new RegExp]]
      ).find(p => p[1]);

      if (usePrefix) {
        match = prefixMatch;
      } else {
        match = prefixMatch && prefixMatch[0] && prefixMatch[0][0] ?
          prefixMatch : // There is a matching prefix, use it.
          // @ts-ignore
          [[['', m.text], new RegExp("^")]]; // No prefix, use direct text
      }

      if (typeof plugin.before === 'function') if (await plugin.before.call(this, m, {
        match,
        conn: this,
        participants,
        groupMetadata,
        user,
        bot,
        isROwner,
        isOwner,
        isRAdmin,
        isAdmin,
        isBotAdmin,
        isPrems,
        isBans,
        chatUpdate,
      })) continue;

      if (typeof plugin.exec !== "function") continue;

      let noPrefix: any, command: string, args: any, _args: any, text: string;

      if (usePrefix) {
        if ((usedPrefix = (match[0] || '')[0])) {
          noPrefix = m.text.replace(usedPrefix, '');
          [command, ...args] = noPrefix.trim().split` `.filter((v: any) => v);
          _args = noPrefix.trim().split` `.slice(1);
          text = _args.join` `;
        } else {
          continue;
        }
      } else {
        const hasPrefix = match && match[0] && match[0][0];

        if (!hasPrefix && !m.text.match(/^[A-Za-z]/)) return;

        if (hasPrefix) {
          // There is a prefix, delete the prefix
          usedPrefix = match[0][0];
          noPrefix = m.text.replace(usedPrefix, '');
        } else {
          // No prefix, use direct text
          noPrefix = m.text;
          usedPrefix = '';
        }

        [command, ...args] = noPrefix.trim().split` `.filter((v: any) => v);
        _args = noPrefix.trim().split` `.slice(1);
        text = _args.join` `;
      }

      command = (command || '').toLowerCase();
      let fail = plugin.fail || global.dfail;
      let isAccept = plugin.cmd instanceof RegExp ?
        plugin.cmd.test(command) :
        Array.isArray(plugin.cmd) ?
          plugin.cmd.some((cmd: any) => cmd instanceof RegExp ?
            cmd.test(command) :
            cmd === command
          ) :
          typeof plugin.cmd === 'string' ?
            plugin.cmd === command :
            false;

      if (!isAccept) continue;
      
      if (plugin.disabled && !global.db.data.users[m.sender].moderator) {
        await m.reply("Sorry, This command is currently disabled by the owner :(");
        return;
      }
      
      m.plugin = name
      if (m.chat in global.db.data.chats || m.sender in global.db.data.users) {
        let chat = global.db.data.chats[m.chat]
        let user = global.db.data.users[m.sender]
        if (name != 'owner/unbanchat.ts' && chat && chat.isBanned) return
        if (name != 'owner/unbanuser.ts' && user && user.banned) return
      }
      if (plugin.rowner && plugin.owner && !(isROwner || isOwner)) {
        fail('owner', m, this)
        continue
      }
      if (plugin.rowner && !isROwner) { // Real Owner
        fail('rowner', m, this)
        continue
      }
      if (plugin.owner && !isOwner) { // Number Owner
        fail('owner', m, this)
        continue
      }
      if (plugin.mods && !isMods) { // Moderator
        fail('mods', m, this)
        continue
      }
      if (plugin.premium && !isPrems) { // Premium
        fail('premium', m, this)
        continue
      }
      if (plugin.banned && !isBans) { // Banned
        fail('banned', m, this)
        continue
      }
      if (plugin.group && !m.isGroup) { // Group Only
        fail('group', m, this)
        continue
      } else if (plugin.botAdmin && !isBotAdmin) { // You Admin
        fail('botAdmin', m, this)
        continue
      } else if (plugin.admin && !isAdmin) { // User Admin
        fail('admin', m, this)
        continue
      }
      if (plugin.private && m.isGroup) { // Private Chat Only
        fail('private', m, this)
        continue
      }
      if (plugin.register == true && _user.registered == false) { // Need to register?
        fail('unreg', m, this)
        continue
      }
      m.isCommand = true
      // This is xp user, Where only run command 
      // Users gain EXP based on their level.
      if (!opts["self"]) {
        const { calculateDynamicXP } = await import('./libs/xp-system.ts');
        const baseXP = 'exp' in plugin ? parseInt(plugin.exp) : 50;
        const currentLevel = global.db.data.users[m.sender]?.level;
        m.exp = calculateDynamicXP(baseXP, currentLevel);
      } else {
        m.exp = 0;
      }

      if (!isPrems && plugin.limit && global.db.data.users[m.sender].limit < plugin.limit * 1) {
        this.reply(m.chat, "Your bot usage limit has expired and will be reset at 00.00 WIB (Indonesian Time)\nTo get more limit upgrade to premium send *.premium*", m);
      }

      if (plugin.level > _user.level) {
        this.reply(m.chat, `${plugin.level} level is required to use this command. Your level is ${_user.level}`, m)
        continue // If the level has not been reached
      }
      let extra = {
        match,
        usedPrefix,
        noPrefix,
        _args,
        args,
        body,
        command,
        text,
        conn: this,
        participants,
        groupMetadata,
        user,
        bot,
        isROwner,
        isOwner,
        isRAdmin,
        isAdmin,
        isBotAdmin,
        isPrems,
        isBans,
        delay,
        chatUpdate,
        checkTarget,
      }
      try {
        await plugin.exec.call(this, m, extra);
        if (!isPrems) m.limit = m.limit || plugin.limit || true;
      } catch (e: any) {
        m.error = e
        console.error(e)
        if (e) {
          let text = util.format(e)
          for (let key of Object.values(global.APIKeys))
            // @ts-ignore
            text = text.replace(new RegExp(key, 'g'), 'DitzDev')
          if (e.name) for (let [jid] of global.owner.filter(([number, _, isDeveloper]) => isDeveloper && number)) {
            let data = (await this.onWhatsApp(jid))[0] || {}
            if (data.exists) conn.reply(data.jid, `*Plugin:* ${m.plugin}\n*Sender:* ${m.sender}\n*Chat:* ${m.chat}\n*Command:* ${usedPrefix}${command} ${args.join(' ')}\n\n\`\`\`${text}\`\`\``, m)
          }
          conn.reply(m.chat, text, m)
        }
      } finally {
        if (typeof plugin.after === 'function') {
          try {
            await plugin.after.call(this, m, extra)
          } catch (e) {
            console.error(e)
          }
        }
      }
      break
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (opts['queque'] && m.text) {
      const quequeIndex = this.msgqueque.indexOf(m.id || m.key.id)
      if (quequeIndex !== -1) this.msgqueque.splice(quequeIndex, 1)
    }

    let user: any, stats = global.db.data.stats
    if (m) {
      if (m.sender && (user = global.db.data.users[m.sender])) {
        if (!opts["self"]) {
          user.exp += m.exp
          user.limit -= m.limit * 1
        }
      }

      let stat: any
      if (m.plugin) {
        let now = + new Date
        if (m.plugin in stats) {
          stat = stats[m.plugin]
          if (!isNumber(stat.total)) stat.total = 1
          if (!isNumber(stat.success)) stat.success = m.error != null ? 0 : 1
          if (!isNumber(stat.last)) stat.last = now
          if (!isNumber(stat.lastSuccess)) stat.lastSuccess = m.error != null ? 0 : now
        } else stat = stats[m.plugin] = {
          total: 1,
          success: m.error != null ? 0 : 1,
          last: now,
          lastSuccess: m.error != null ? 0 : now
        }
        stat.total += 1
        stat.last = now
        if (m.error == null) {
          stat.success += 1
          stat.lastSuccess = now
        }
        
        if (m.isCommand && m.error == null) {
          const plugin = global.plugins[m.plugin];
          if (plugin && plugin.cmd) {
            let commandToTrack = '';
          
            if (Array.isArray(plugin.cmd)) {
              const firstCmd = plugin.cmd[0];
              if (typeof firstCmd === 'string') {
                commandToTrack = firstCmd;
              } else if (firstCmd instanceof RegExp) {
                const pattern = firstCmd.source;
                const match = pattern.match(/^\^?\(?([a-z0-9_-]+)/i);
                if (match) commandToTrack = match[1];
              }
            } else if (typeof plugin.cmd === 'string') {
              commandToTrack = plugin.cmd;
            } else if (plugin.cmd instanceof RegExp) {
              const pattern = plugin.cmd.source;
              const match = pattern.match(/^\^?\(?([a-z0-9_-]+)/i);
              if (match) commandToTrack = match[1];
            }
          
            if (commandToTrack) {
              trackCommandUsage(m.plugin, commandToTrack);
            }
          }
        }
      }
    }
    try {
      await (await import(`./libs/print.ts?update=${Date.now()}`)).default(m, this);
    } catch (e) {
      console.log(m, m.quoted, e)
    }

    if (opts["autoread"])
      await this.chatRead(
        m.chat,
        m.isGroup ? m.sender : undefined,
        m.id || m.key.id,
      ).catch(() => { });
  }
}

function trackCommandUsage(pluginName: string, command: string) {
  try {
    if (!global.db.data.commandUsage) {
      global.db.data.commandUsage = {};
    }
    
    const plugin = global.plugins[pluginName];
    if (!plugin) return;
    
    const commandKey = command.toLowerCase();
    const metadata = global.commandCache?.getMetadata()?.get(pluginName);
    
    if (!global.db.data.commandUsage[commandKey]) {
      global.db.data.commandUsage[commandKey] = {
        pluginName: pluginName,
        name: metadata?.name || plugin.name || command,
        description: metadata?.description || plugin.description || '',
        command: commandKey,
        count: 0,
        lastUsed: Date.now(),
        tags: metadata?.tags || plugin.tags || []
      };
    }
    
    global.db.data.commandUsage[commandKey].count++;
    global.db.data.commandUsage[commandKey].lastUsed = Date.now();
    
    const entries = Object.entries(global.db.data.commandUsage);
    if (entries.length > 100) {
      const sorted = entries.sort((a: any, b: any) => b[1].count - a[1].count);
      global.db.data.commandUsage = Object.fromEntries(sorted.slice(0, 100));
    }
  } catch (e) {
    console.error('Error tracking command usage:', e);
  }
}

export async function participantsUpdate({ id, participants, action }: BaileysEventMap["group-participants.update"], simulate: boolean = false) {
  if (conn.isInit) return;
  if (opts["self"]) return;
  if (this.isInit && !simulate) return;
  if (global.db.data == null) await loadDatabase();

  let chat = global.db.data.chats[id] || {};
  let text = '';

  switch (action) {
    case 'add':
    case 'remove': {
      if (chat.welcome) {
        let groupMetadata = await (this as ExtendedWASocket).groupMetadata(id) || (conn.chats[id] || {}).metadata;

        for (let user of participants) {
          let pp = 'https://telegra.ph/file/24fa902ead26340f3df2c.png';
          let gcname = groupMetadata.subject;

          let userJid: string;
          if (typeof user === 'string') {
            userJid = user;
          } else if (user && typeof user === 'object') {
            userJid = user.phoneNumber || await this.getJid(user.id);
          } else {
            console.error('Cannot extract JID from user:', user);
            continue;
          }

          try {
            pp = await (this as ExtendedWASocket).profilePictureUrl(userJid, 'image') as string;
          } catch { }

          const defaultWelcome = `┏━━━❰ *WELCOME* ❱━━━┓
┃
┃ Hey @user! 👋
┃
┃ Welcome to
┃ *@subject*
┃
┃ Please read the group
┃ description and rules! 📋
┃
┗━━━━━━━━━━━━━━━┛`;

          const defaultBye = `┏━━━❰ *GOODBYE* ❱━━━┓
┃
┃ @user has left 👋
┃
┃ We'll miss you in *@subject*
┃
┃ Take care! 🌟
┃
┗━━━━━━━━━━━━━━━┛`;

          text = (action === "add"
            ? (chat.sWelcome || defaultWelcome)
            : (chat.sBye || defaultBye)
          )
            .replace('@subject', gcname)
            .replace('@user', '@' + userJid.split('@')[0]);

          (this as ExtendedWASocket).sendMessage(id, {
            text: text,
            contextInfo: {
              mentionedJid: [userJid],
              externalAdReply: {
                // If your bot is a WA Business, maybe you can use this property
                // related isues: https://github.com/wppconnect-team/wa-js/issues/1714
                // showAdAttribution: true,
                title: "YukiBotz",
                thumbnailUrl: pp,
                sourceUrl: global.sourceUrl,
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
          }, { quoted: null } as any);
        }
      }
      break;
    }

    case 'promote':
    case 'demote': {
      let user = participants[0];
      let userJid: string;

      if (typeof user === 'string') {
        userJid = user;
      } else if (user && typeof user === 'object') {
        userJid = user.phoneNumber || await this.getJid(user.id);
      } else {
        console.error('Cannot extract JID from user:', user);
        return;
      }

      text = action === 'promote'
        ? '@user now is admin'
        : '@user no longer an admin';

      text = text.replace('@user', '@' + userJid.split('@')[0]);

      if (chat.detect) {
        await this.sendMessage(id, {
          text,
          mentions: this.parseMention(text)
        });
      }
      break;
    }
  }
}

export async function groupsUpdate(groupsUpdate: BaileysEventMap["groups.update"]) {
  if (opts['self']) return;
  if (conn.isInit) return;
  for (const groupUpdate of groupsUpdate) {
    const id = groupUpdate.id
    if (!id) continue
    let chats = global.db.data.chats[id],
      text = ''
    if (!chats?.detect) continue
    if (groupUpdate.desc) text = (chats.sDesc || this.sDesc || conn.sDesc || '```Description has been changed to```\n@desc').replace('@desc', groupUpdate.desc)
    if (groupUpdate.subject) text = (chats.sSubject || this.sSubject || conn.sSubject || '```Subject has been changed to```\n@subject').replace('@subject', groupUpdate.subject)
    if (groupUpdate.announce == true) text = (chats.sAnnounceOn || this.sAnnounceOn || conn.sAnnounceOn || '*Group has been closed!*')
    if (groupUpdate.announce == false) text = (chats.sAnnounceOff || this.sAnnounceOff || conn.sAnnounceOff || '*Group has been open!*')
    if (groupUpdate.restrict == true) text = (chats.sRestrictOn || this.sRestrictOn || conn.sRestrictOn || '*The group has been set to: all participants can send messages.*')
    if (groupUpdate.restrict == false) text = (chats.sRestrictOff || this.sRestrictOff || conn.sRestrictOff || '*Group has been changed to: Only admins can send messages.*')
    if (!text) continue
    this.reply(id, text.trim())
  }
}

global.dfail = (type: any, m: any, conn: any) => {
  // let userss = global.db.data.users[m.sender]
  let imgr = 'https://files.catbox.moe/0604mz.jpeg'
  let msg = {
    rowner: '```Sorry, This Feature Is For Creators Only```',
    owner: '```Sorry, this feature is only for Owners```',
    mods: '```Sorry, This Feature is for Moderators only```',
    group: '```Sorry, this feature can only be used in groups```',
    private: '```This feature can only be used in Private Chat!```',
    admin: null,
    botAdmin: '```Yuki Blom Jadi Admin, Gabisa pake Fitur itu🥲```',
    restrict: '```Restrict is turned on in this Chat, Please turn off restrict```',
    unreg: '```You are not registered yet, please register first by typing:\n.register```',
    premium: '```This feature can only be accessed by premium members!```',
  }[type];
  if (type === 'admin') {
    let stickerBuffer = fs.readFileSync('./media/admin.webp');
    conn.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
  } else if (msg) {
    return conn.sendMessage(
      m.chat,
      {
        text: msg,
        contextInfo: {
          mentionedJid: conn.parseMention(msg),
          groupMentions: [],
          isForwarded: true,
          businessMessageForwardInfo: {
            businessOwnerJid: global.owner[0] + "@s.whatsapp.net",
          },
          forwardingScore: 256,
          externalAdReply: {
            title: "Yuki Botz by DitzDev",
            body: 'ACCESS_DANIED',
            thumbnailUrl: imgr,
            sourceUrl: null,
            mediaType: 1,
            renderLargerThumbnail: false,
          },
        },
      },
      { quoted: m },
    );
  }
  let msg3 = {
    zevent: `This command can only be used during event*!`
  }[type]
  if (msg3) return m.reply(msg3)
}
