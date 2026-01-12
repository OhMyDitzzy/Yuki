import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Unregister",
  description: "Unregister your account",
  cmd: ["unreg"],
  tags: ["public"],
  exp: 0,
  exec: async (m, { conn, text, usedPrefix, command }) => {
    let btnMsg;
    
    if (!global.db.data.users[m.sender].registered) throw `• *You are not registered yet, please register first.*`;
    if (!text) {
      return conn.sendMessage(m.chat, {
        text: "Are you sure you want to unregister? All your data will be erased.",
        footer: "This action cannot be recovered",
        buttons: [{
          buttonId: `${usedPrefix + command} yes`,
          buttonText: {
            displayText: "Yes"
          },
          type: 1
        }, {
          buttonId: `${usedPrefix + command} no`,
          buttonText: {
            displayText: "No, I changed my mind"
          },
          type: 1
        }],
        headerType: 1,
        viewOnce: true
      }, { quoted: m });
    }

    if (text === "yes") {
      global.db.data.users[m.sender] = {};
      global.db.data.rpg[m.sender] = {};

      m.reply("✅ Your data has been deleted and you have been unregistered.")
    } if (text === "no") {
      if (m.quoted) {
        return conn.sendMessage(m.chat, {
          delete: {
            remoteJid: m.chat,
            fromMe: true,
            id: m.quoted.id
          }
        })
      }
    }
  }
}

export default handler;
