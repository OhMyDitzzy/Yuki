import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "List sticker commands",
  description: "Display all saved sticker commands",
  tags: ["premium"],
  usage: ["listcmd"],
  cmd: ["listcmd"],
  premium: true,
  exec: async (m, { conn }) => {
    let sticker = db.data.sticker || {};
    
    if (Object.keys(sticker).length === 0) {
      return m.reply('❌ No sticker commands saved yet!');
    }
    
    let text = '*STICKER COMMAND LIST*\n';
    text += '```\n';
    text += Object.entries(sticker)
      .map(([key, value], index) => {
        let status = value.locked ? '🔒' : '🔓';
        return `${index + 1}. ${status} ${value.text}`;
      })
      .join('\n');
    text += '\n```';
    
    let mentions = Object.values(sticker)
      .map(x => x.mentionedJid || [])
      .reduce((a, b) => [...a, ...b], []);
    
    await conn!!.reply(m.chat, text, null, { mentions });
  }
}

export default handler;