import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Kick member",
  description: "Kick members from the group",
  tags: ["admin_group"],
  usage: ["kick"],
  admin: true,
  botAdmin: true,
  group: true,
  cmd: ["kick", "dor", "kik"],
  usePrefix: false,
  exec: async (m, { conn, checkTarget }) => {
    const metadata = await conn!!.groupMetadata(m.chat)

    let rawTarget: string | undefined
    if (m.quoted) rawTarget = m.quoted.sender
    else if (m.mentionedJid?.length) rawTarget = m.mentionedJid[0]

    if (!rawTarget)
      return m.reply("Tag or reply to the member you want to kick")

    const { targetROwner, targetUser } = await checkTarget!!(rawTarget)

    if (!targetUser)
      return m.reply("Member not found in group")

    const botLid = await conn!!.getLid(conn!!.user.lid);

    if (targetROwner || targetUser.id === metadata.owner || targetUser.id === botLid) {
      return m.reply("Can't kick owner / bot")
    }

    await conn!!.groupParticipantsUpdate(m.chat, [targetUser.id], "remove")
  }
}

export default handler;
