import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["say", "echo"],
  exec: async (m, { text }) => {
    // Check if user provided text after command
    if (!text) {
      return m.reply("Usage: .say [text]\nExample: .say Hello World");
    }
    
    await m.reply(text);
  }
};

export default handler;