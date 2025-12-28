import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["test"],
  
  // exec: Main command execution
  exec: async (m, { text }) => {
    if (!text) {
      throw new Error("No text provided");
    }
    
    await m.reply(`Processing: ${text}`);
  },
  
  // after: Runs AFTER exec completes (success or failure)
  // Parameters are the same as before and exec: (m, ctx)
  // Note: There's NO error parameter - check execution result through context
  after: async (m, { conn, command, text, user }) => {
    // Log command execution (runs whether exec succeeded or failed)
    console.log(`[AFTER] Command: ${command}`);
    console.log(`[AFTER] User: ${m.sender}`);
    console.log(`[AFTER] Text: ${text}`);
    
    // Update user statistics after command execution
    if (user) {
      user.commandCount = (user.commandCount || 0) + 1;
      user.lastCommand = command;
      user.lastCommandTime = Date.now();
    }
    
    // Cleanup: Remove temporary data
    if (global.temp && global.temp[m.sender]) {
      delete global.temp[m.sender];
    }
    
    // Send completion notification (optional)
    console.log(`✅ Command ${command} completed`);
  }
};

export default handler;