import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["special"],
  register: true,
  limit: 5,  // This command costs 5 limit to use, or you can set true to use 1 limit
  exec: async (m) => {
    // User's limit will automatically be deducted
    await m.reply(
      `✨ Special feature used!\n` +
      `This cost you 5 limits.`
    );
  }
};

export default handler;