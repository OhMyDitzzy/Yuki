import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["info", "botinfo"],
  exec: async (m, { conn }) => {
    // 'conn' gives access to the WhatsApp connection/socket
    const botNumber = conn?.user?.id?.split(':')[0];
    const botName = conn?.user?.name || "Bot";
    
    await m.reply(
      `📱 *Bot Information*\n\n` +
      `Name: ${botName}\n` +
      `Number: ${botNumber}`
    );
  }
};

export default handler;