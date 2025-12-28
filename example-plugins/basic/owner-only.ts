import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["broadcast", "bc"],
  owner: true,  // Only bot owner can use this
  exec: async (m, { text, conn }) => {
    if (!text) {
      return m.reply("Usage: .broadcast [message]");
    }
    
    await m.reply("Broadcasting message to all chats...");
    
    // Get all chat IDs
    const chats = Object.keys(global.db.data.chats);
    
    // Send to all chats
    for (let chat of chats) {
      await conn!!.sendMessage(chat, { text: text });
    }
    
    await m.reply(`✅ Broadcasted to ${chats.length} chats`);
  }
};

export default handler;