import { areJidsSameUser, generateWAMessage, proto, type BaileysEventMap } from "baileys";
import type { ExtendedWAMessage } from "types/extendWAMessage";

export async function before(m: ExtendedWAMessage, chatUpdate: BaileysEventMap["messages.upsert"]) {
  if (m.isBaileys) return;
  if (!m.message) return;
  if (!(m.message.buttonsResponseMessage || m.message.templateButtonReplyMessage || m.message.listResponseMessage)) return;
  let id = m.message.buttonsResponseMessage?.selectedButtonId || m.message.templateButtonReplyMessage?.selectedId || m.message.listResponseMessage?.singleSelectReply?.selectedRowId || (m as any).message.interactiveResponseMessage?.paramsJson;
  let text = m.message.buttonsResponseMessage?.selectedDisplayText || m.message.templateButtonReplyMessage?.selectedDisplayText || m.message.listResponseMessage?.title || (m as any).message.InteractiveResponseMessage?.paramsJson;
  let isIdMessage = false, usedPrefix: any;
  for (let name in global.plugin) {
    let plugin = global.plugins[name]
    if (!plugin) continue;
    if (plugin.disabled) continue;
    if (!opts['restrict']) {
      if (plugin.tags && plugin.tags.includes('admin')) continue
    }
    if (typeof plugin.exec !== 'function') continue;
    const str2Regex = (str: string) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    let _prefix = plugin.customPrefix ? plugin.customPrefix : this.prefix ? this.prefix : global.prefix
    let match = (_prefix instanceof RegExp ? // RegExp Mode?
      [[_prefix.exec(id), _prefix]] : Array.isArray(_prefix) ? // Array?
        _prefix.map(p => {
          let re = p instanceof RegExp ? // RegExp in Array?
            p : new RegExp(str2Regex(p))
          return [re.exec(id), re]
        }) : typeof _prefix === 'string' ? // String?
          // @ts-ignore
          [[new RegExp(str2Regex(_prefix)).exec(id), new RegExp(str2Regex(_prefix))]] : [[[], new RegExp]]
    ).find(p => p[1])
    if ((usedPrefix = (match!![0] || '')[0])) {
      let noPrefix = id.replace(usedPrefix, '')
      let [command] = noPrefix.trim().split` `.filter((v: any) => v)
      command = (command || '').toLowerCase()
      let isId = plugin.command instanceof RegExp ? // RegExp Mode?
        plugin.command.test(command) : Array.isArray(plugin.command) ? // Array?
          plugin.command.some((cmd: any) => cmd instanceof RegExp ? // RegExp in Array?
            cmd.test(command) : cmd === command) : typeof plugin.command === 'string' ? // String?
            plugin.command === command : false
      if (!isId) continue
      isIdMessage = true
    }
  }

  let messages = await generateWAMessage(m.chat, { text: isIdMessage ? id : text, mentions: m.mentionedJid }, {
    userJid: this.user.id,
    quoted: (m as any).quoted && (m as any).quoted.fakeObj
  } as any)

  messages.key.fromMe = areJidsSameUser(m.sender, this.user.id)
  messages.key.id = m.key.id
  messages.pushName = m.name

  if (m.isGroup)
    messages.key.participant = messages.participant = m.sender
  let msg = {
    ...chatUpdate,
    messages: [proto.WebMessageInfo.fromObject(messages)].map(v => ((v as any).conn = this, v)),
    type: 'append'
  }
  this.ev.emit('messages.upsert', msg)
}
