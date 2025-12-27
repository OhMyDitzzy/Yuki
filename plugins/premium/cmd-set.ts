import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Set sticker to cmd",
  description: "Change stickers to commands",
  tags: ["premium"],
  premium: true,
  usage: ["cmd"].map((v: string) => 'set' + v + ' <text>'),
  cmd: ["setcmd"],
  exec: async (m, { text, usedPrefix, command }) => {
    db.data.sticker = db.data.sticker || {};
    if (!m.quoted) throw `• *Reply to stickers using the command:* ${usedPrefix + command!!} <text-to-command>`;

    if (!m.quoted.fileSha256) throw '❌ SHA256 Hash Missing';

    if (!text) throw `• *Can't apply stickers without command, Use:* ${usedPrefix + command!!} <text-to-command>`;

    let sticker = db.data.sticker
    
    let hash: string;
    if (typeof m.quoted.fileSha256 === 'string') {
      hash = m.quoted.fileSha256;
    } else {
      hash = Buffer.from(m.quoted.fileSha256).toString('base64');
    }    
    
    if (sticker[hash]) {
      if (m.sender !== sticker[hash].creator) {
        throw '❌ You do not have permission to modify this sticker command. Only the creator can modify it.';
      }
      if (m.sender !== sticker[hash].creator && sticker[hash].locked) {
        throw '🔒 This sticker command is locked and cannot be modified.';
      }
    }

    m.react("⏳")

    sticker[hash] = {
      text,
      mentionedJid: m.mentionedJid,
      creator: m.sender,
      at: + new Date,
      locked: false,
    }

    m.react("✅");
    m.reply(`✅ Success!`)
  }
}

export default handler;