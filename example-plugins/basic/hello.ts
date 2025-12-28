import type { PluginHandler } from "@yuki/types";

// Property 'cmd' and 'exec' are REQUIRED
// Without them, your plugin won't work and may cause errors
let handler: PluginHandler = {
  cmd: ["hello", "hi"],  // REQUIRED: command triggers
  exec: async (m) => {   // REQUIRED: function that runs when command is called
    await m.reply(`Hello ${m.name}! 👋`);
  }
};

export default handler;