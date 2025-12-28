import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["chat"],
  
  // exec: Main command handler
  exec: async (m, { text }) => {
    if (!text) {
      return m.reply("Please provide a message!");
    }
    
    // Main command logic
    await m.reply(`You said: ${text}`);
  },
  
  // before: Pre-processing hook that runs before exec
  // Can intercept messages and handle them before the main command
  before: async (m, { conn }) => {
    // Skip if message is from bot itself
    if (m.sender === conn?.user?.jid) return false;
    
    // Check if bot is mentioned in the message
    const isMentioned = m.mentionedJid?.includes(conn?.user?.lid as string);
    
    // Check if message is a reply to bot's message
    const isReply = m.quoted?.sender === conn?.user?.lid;
    
    // If bot is not mentioned or replied to, skip this hook
    if (!isMentioned && !isReply) return false;
    
    // Extract user message text
    let userText = m.text || "";
    if (isMentioned) {
      // Remove mention tags from text
      userText = userText.replace(/@\d+/g, '').trim();
    }
    
    if (!userText) {
      await m.reply("Hello! How can I help you?");
      return true; // Stop further processing
    }
    
    // Handle the message in before hook
    try {
      await m.reply(`Before hook response: ${userText}`);
      return true; // Return true to prevent exec from running
    } catch (error) {
      console.error("Before hook error:", error);
      return false; // Return false to continue to exec
    }
  }
};

export default handler;