import type { PluginHandler } from "@yuki/types"

const handler: PluginHandler = {
  name: "Execute a shell command",
  cmd: /.*/,
  customPrefix: /^[$]/,
  owner: true,
  exec: async (m, { conn, isOwner, command, text }) => {
    if (!isOwner) return
    if (conn!!.user.jid !== conn!!.user.jid) return

    await m.reply("Executing...")

    try {
      const result = await Bun.$`${command} ${text}`.quiet()

      if (result.stdout.toString().trim())
        await m.reply(result.stdout.toString())

      if (result.stderr.toString().trim())
        await m.reply(result.stderr.toString())

    } catch (err: any) {
      await m.reply(String(err.stderr || err.message || err))
    }
  }
}

export default handler;
