import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Lock/Unlock sticker command",
  description: "Lock or unlock sticker commands to prevent modification",
  tags: ["premium"],
  premium: true,
  usage: ["lockcmd", "unlockcmd"],
  cmd: ["lockcmd", "unlockcmd"],
  exec: async (m, { text, usedPrefix, command }) => {
    if (!m.quoted) throw '• *Reply to a sticker!*';
    if (!m.quoted.fileSha256) throw '❌ SHA256 Hash Missing';
    
    let sticker = db.data.sticker || {};
    
    let hash: string;
    if (typeof m.quoted.fileSha256 === 'string') {
      hash = m.quoted.fileSha256;
    } else {
      hash = Buffer.from(m.quoted.fileSha256).toString('base64');
    }
    
    if (!(hash in sticker)) throw '❌ Hash not found in database';
    
    if (m.sender !== sticker[hash].creator) throw '❌ You do not have permission to lock/unlock this sticker command. Only the creator can do this.';
    
    sticker[hash].locked = !/^un/i.test(command!!);
    
    m.reply(sticker[hash].locked ? '🔒 Command locked!' : '🔓 Command unlocked!');
  }
}

export default handler;