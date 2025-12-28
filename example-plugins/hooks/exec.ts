import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["hello"],
  // exec: Main execution hook - runs when command is called
  // This is the primary function that handles the command logic
  exec: async (m, { conn, text }) => {
    // Your main command logic here
    await m.reply(`Hello ${m.name}!`);
  }
};

export default handler;