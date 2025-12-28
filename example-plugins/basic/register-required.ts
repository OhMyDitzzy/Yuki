import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["profile", "me"],
  register: true,  // User must be registered in database
  exec: async (m) => {
    // Get user data from database
    let user = global.db.data.users[m.sender];
    
    await m.reply(
      `👤 *Your Profile*\n\n` +
      `Name: ${user.name}\n` +
      `Level: ${user.level || 0}\n` +
      `Exp: ${user.exp || 0}\n` +
      `Money: ${user.money || 0}`
    );
  }
};

export default handler;