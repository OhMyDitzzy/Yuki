import type { PluginHandler } from "@yuki/types"

const handler: PluginHandler = {
  cmd: /.*/,
  customPrefix: /^[$]/,
  owner: true,
  exec: async (m, { conn, isOwner, command, text }) => {
    if (!isOwner) return
    if (conn!!.user.jid !== conn!!.user.jid) return

    let { key } = await m.reply("Executing...")

    try {
      const result = await Bun.$`${command} ${text}`.quiet()

      if (result.stdout.toString().trim())
        await conn!!.sendMessage(m.chat, { text: result.stdout.toString(), edit: key }, { quoted: m })

      if (result.stderr.toString().trim())
        await conn!!.sendMessage(m.chat, { text: result.stderr.toString(), edit: key }, { quoted: m })

    } catch (err: any) {
      await conn!!.sendMessage(m.chat, { text: String(err.stderr || err.message || err), edit: key }, { quoted: m })
    }
  }
}

export default handler;
