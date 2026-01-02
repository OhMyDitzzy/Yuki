import {
  proto,
  generateWAMessage,
  areJidsSameUser
} from 'baileys'

export async function all(m: any, chatUpdate: any) {
  if (m.isBaileys)
    return
  if (!m.message)
    return
  if (!(m.message.buttonsResponseMessage || m.message.templateButtonReplyMessage || m.message.listResponseMessage || m.message.interactiveResponseMessage))
    return

  let id: any;
  let text: any;

  if (m.message.buttonsResponseMessage) {
    id = m.message.buttonsResponseMessage.selectedButtonId;
    text = m.message.buttonsResponseMessage.selectedDisplayText;
  } else if (m.message.templateButtonReplyMessage) {
    id = m.message.templateButtonReplyMessage.selectedId;
    text = m.message.templateButtonReplyMessage.selectedDisplayText;
  } else if (m.message.listResponseMessage) {
    id = m.message.listResponseMessage.singleSelectReply?.selectedRowId;
    text = m.message.listResponseMessage.title;
  } else if (m.message.interactiveResponseMessage) {
    const params = JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
    id = params.id;
    text = params.title || m.message.interactiveResponseMessage.body?.text || id;
  }

  if (!text) text = id || '';
  if (!id) id = text || '';

  let usedPrefix = '';
  let command = id;

  const str2Regex = (str: any) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let _prefix = this.prefix || global.prefix

  let match = (_prefix instanceof RegExp ?
    [[_prefix.exec(id), _prefix]] :
    Array.isArray(_prefix) ?
      _prefix.map(p => {
        let re = p instanceof RegExp ?
          p :
          new RegExp(str2Regex(p))
        return [re.exec(id), re]
      }) :
      typeof _prefix === 'string' ?
        [[new RegExp(str2Regex(_prefix)).exec(id), new RegExp(str2Regex(_prefix))]] :
        // @ts-ignore
        [[[], new RegExp]]
  ).find(p => p[1])

  if (match && match[0] && match[0][0]) {
    usedPrefix = match[0][0];
    command = id.replace(usedPrefix, '').trim().split(' ')[0].toLowerCase();
  }

  const cachedCommand = commandCache.find(command);
  const isValidCommand = cachedCommand !== null;

  let messages = await generateWAMessage(m.chat, {
    text: isValidCommand ? id : text,
    mentions: m.mentionedJid
  }, {
    userJid: this.user.id,
    quoted: m.quoted && m.quoted.fakeObj
  } as any)

  messages.key.fromMe = areJidsSameUser(m.sender, this.user.id)
  messages.key.id = m.key.id
  messages.pushName = m.name
  if (m.isGroup) messages.key.participant = messages.participant = m.sender

  let msg = {
    ...chatUpdate,
    messages: [proto.WebMessageInfo.create(messages)].map(v => ((v as any).conn = this, v)),
    type: 'append'
  }

  this.ev.emit('messages.upsert', msg)
}
