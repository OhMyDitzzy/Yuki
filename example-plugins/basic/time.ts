import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["time", "waktu"],
  exec: async (m, { text }) => {  // 'text' contains message after command
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const dateString = now.toLocaleDateString();
    
    await m.reply(
      `🕐 Current Time\n\n` +
      `Time: ${timeString}\n` +
      `Date: ${dateString}` +
      `You said: ${text!!}`
    );
  }
};

export default handler;