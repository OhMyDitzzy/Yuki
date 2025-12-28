import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["download", "dl"],
  
  exec: async (m, { conn, text }) => {
    // Initialize queue object if not exists
    // This stores ongoing download processes
    conn!!.downloadQueue = conn!!.downloadQueue || {};
    
    // Check if user already has an active download
    if (conn!!.downloadQueue[m.sender]) {
      return m.reply(
        "⚠️ You already have a download in progress!\n" +
        "Please wait until it completes."
      );
    }
    
    // Mark user as processing
    conn!!.downloadQueue[m.sender] = {
      status: "processing",
      url: text,
      startTime: Date.now()
    };
    
    try {
      // Simulate download process
      await m.reply("⬇️ Starting download...");
      await new Promise(resolve => setTimeout(resolve, 5000));
      await m.reply("✅ Download complete!");
      
    } catch (error: any) {
      await m.reply(`❌ Download failed: ${error.message}`);
    } finally {
      // is recommended to ALWAYS delete queue entry when done (success or failure)      
      delete conn!!.downloadQueue[m.sender];
    }
  }
};

export default handler;