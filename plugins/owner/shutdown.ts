import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["shutdown", "stop"],
  rowner: true,
  exec: async (m, { conn }) => {
    if (!process.send) {
      return m.reply(`❌ Process not handled by cluster`);
    }
    
    await m.reply(`🛑 Shutting down bot gracefully...\n\nGoodbye! 👋`);
 
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (global.conn.user.jid === conn!!.user.jid) {
      process.send('shutdown');
    }
  }
}

export default handler;