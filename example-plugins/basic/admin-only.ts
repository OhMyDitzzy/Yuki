import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["announce"],
  group: true,      // Must be in group
  admin: true,      // Only group admins can use
  exec: async (m, { text }) => {
    if (!text) {
      return m.reply("Usage: .announce [message]");
    }
    
    await m.reply(
      `📢 *ANNOUNCEMENT*\n\n` +
      `${text}\n\n` +
      `- By Admin ${m.name}`
    );
  }
};

export default handler;