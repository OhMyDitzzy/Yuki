import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["restart", "rc"],
  rowner: true,
  exec: async (m, { conn, text }) => {
    if (!process.send) {
      return m.reply(`❌ Process not handled by cluster`);
    }
    
    await m.reply(`Restarting bot... see ya!`);
    
    if (global.conn.user.jid === conn!!.user.jid) {
      if (text.trim() === "process") {
        process.send('reset');
      } else {
        process.send('restart_conn');
      }
    }
  }
}

export default handler;