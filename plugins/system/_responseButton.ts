import { areJidsSameUser, generateWAMessage, proto } from "baileys"

export async function before(m, chatUpdate) {
  if (m.isBaileys) return
  if (!m.message) return
  if (m.mtype === "interactiveResponseMessage" && m.quoted.fromMe) appenTextMessage(JSON.parse(m.msg.nativeFlowResponseMessage.paramsJson).id, chatUpdate)

  async function appenTextMessage(text, chatUpdate) {
    let messages = await generateWAMessage(m.chat, { text: text, mentions: m.mentionedJid }, {
      userJid: conn.user.id,
      quoted: m.quoted && m.quoted.fakeObj
    } as any)
    messages.key.fromMe = areJidsSameUser(m.sender, conn.user.id)
    messages.key.id = m.key.id
    messages.pushName = m.pushName
    if (m.isGroup) messages.participant = m.sender
    let msg = {
      ...chatUpdate,
      messages: [proto.WebMessageInfo.fromObject(messages)],
      type: 'append'
    }
    conn.ev.emit('messages.upsert', msg)
  }
}
