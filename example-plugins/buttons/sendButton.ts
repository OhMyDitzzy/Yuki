import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["btn1"],
  exec: async (m, { conn }) => {
    // Basic text buttons without media
    await conn!!.sendButton(
      m.chat,
      "This is a basic button message", // Main text
      // The property ID will automatically match the cmd command, for example, if you enter .ping, it will call .ping
      [
        {
          id: "btn_1", 
          displayText: "Button 1"
        },
        {
          id: "btn_2", 
          displayText: "Button 2"
        }
      ],
      m, // Quoted message
      {
        footer: "This is footer text" // Optional footer
      }
    );
  }
};

export default handler;