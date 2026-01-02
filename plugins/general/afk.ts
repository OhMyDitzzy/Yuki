import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "AFK",
  description: "AFK is to let other users know that you are temporarily inactive.",
  tags: ["afk"],
  cmd: ["afk"],
  exec: async (m, { text }) => {
    let user = global.db.data.users[m.sender];
    user.afk = +new Date();
    user.afkReason = text;

    m.reply(`@${m.sender} now AFK ${text ? "With Reason : " + text : "Without Reason"}
`);
  }
}

export default handler;
