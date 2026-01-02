import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["reporterror"],
  exec: async (m, { text, conn }) => {
    if (!text) throw `Please provide an error!`;
    let textError = `Report error from: ${m.sender}\n${text}`;

    conn!!.reply(global.nomorown + "@s.whatsapp.net", textError, null);

    m.reply("Thanks for the report! Owner will probably fix it soon, please be patient!");
  }
}

export default handler;
