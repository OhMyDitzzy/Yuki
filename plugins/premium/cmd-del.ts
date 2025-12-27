import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Delete sticker command",
  description: "Delete a saved sticker command",
  tags: ["premium"],
  premium: true,
  usage: ["delcmd <hash>", "delcmd (reply to sticker)"],
  cmd: ["delcmd"],
  exec: async (m, { text, usedPrefix, command }) => {
    let hash = text;
    
    if (m.quoted && m.quoted.fileSha256) {
      if (typeof m.quoted.fileSha256 === 'string') {
        hash = m.quoted.fileSha256;
      } else {
        hash = Buffer.from(m.quoted.fileSha256).toString('base64');
      }
    }
    
    if (!hash) throw `• *Usage:* ${usedPrefix + command!!} <hash>\n• *Or reply to a sticker*`;
    
    let sticker = db.data.sticker || {};
    
    if (!(hash in sticker)) throw '❌ Hash not found in database';
    
    if (m.sender !== sticker[hash].creator) {
      throw '🔒 You do not have permission to delete this locked sticker command';
    }
    
    delete sticker[hash];
    m.reply('✅ Sticker command deleted successfully!');
  }
}

export default handler;