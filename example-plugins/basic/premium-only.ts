import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["vip", "premium"],
  premium: true,  // Only premium users
  exec: async (m) => {
    await m.reply(
      `💎 *Premium Feature*\n\n` +
      `Thank you for being a premium user!\n` +
      `You have access to exclusive features!`
    );
  }
};

export default handler;