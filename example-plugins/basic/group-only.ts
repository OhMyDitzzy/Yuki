import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["groupinfo"],
  group: true,  // This command only works in groups
  exec: async (m, { groupMetadata }) => {
    // 'groupMetadata' contains group information
    const groupName = groupMetadata?.subject || "Unknown";
    const memberCount = groupMetadata?.participants?.length || 0;
    
    await m.reply(
      `📊 *Group Info*\n\n` +
      `Name: ${groupName}\n` +
      `Members: ${memberCount}`
    );
  }
};

export default handler;