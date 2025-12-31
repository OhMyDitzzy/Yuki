let handler: any = m => m;
handler.before = async function(m) {
  if (!m.isGroup) return;
  try {
    let body = m.text;
    let isAdmins = ((await conn.groupMetadata(m.chat)).participants.filter(v => v.id === m.sender)[0]!!.admin !== null)
    if (!body.includes("@everyone") || !isAdmins) return;
    return conn.sendMessage(m.chat, {
      text: body.replace(/@everyone/i, '@' + m.chat),
      contextInfo: {
        mentionedJid: (await conn.groupMetadata(m.chat)).participants.map(v => v.id),
        groupMentions: [
          {
            groupSubject: "everyone",
            groupJid: m.chat
          }
        ]
      }
    })
  } catch (e) { }
}

export default handler;
