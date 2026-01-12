import type { PluginHandler } from "@yuki/types"

const handler: PluginHandler = {
  name: "Set Password",
  description: "Set your password",
  tags: ["public"],
  private: true,
  cmd: ["setpasswd", "passwd", "setpassword"],
  exp: 0,
  exec: async (m, { text, usedPrefix, command }) => {
    let user = global.db.data.users[m.sender]
    if (!text) throw `• *To set your password, Use this example command:* ${usedPrefix + command} your_password`;

    if (text.length < 6 || text.length > 20) {
      return m.reply("• Password must be 6-20 characters long.");
    }

    user.password = text;

    m.reply("✅ *Password successfully set*")
  }
}

export default handler;
