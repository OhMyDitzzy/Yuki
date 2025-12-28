import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  // Regex pattern for match command
  // This example will match: .test, .tes, .testing
  cmd: /^tes(t|ting)?$/i,
  
  exec: async (m, { text }) => {
    // Retrieving text sent by the user
    if (!text) {
      return m.reply("Usage: .test [message]\nExample: .test Hello World");
    }
    
    // Send a reply
    await m.reply(`You said: ${text}`);
  }
};

export default handler;