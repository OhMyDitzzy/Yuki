import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Vote Cancel",
  description: "Cancel active vote kick polling",
  tags: ["group"],
  cmd: ["votecancel", "vc"],
  group: true,
  admin: true,
  exec: async (m, { conn, usedPrefix, command }) => {
    let sock = conn!!;

    sock.votekick = sock.votekick || {};

    const target = Object.keys(sock.votekick).find(jid =>
      sock.votekick[jid].groupId === m.chat
    );

    if (!target) {
      return m.reply("*No active vote in this group!*");
    }

    const voteData = sock.votekick[target];
    const names = await sock.getName(target);

    delete sock.votekick[target];

    await sock.sendMessage(m.chat, {
      text: `*🗑️ VOTE CANCELLED*\n\n` +
        `Vote to kick @${target.split("@")[0]} (${names || 'Unknown'}) has been cancelled by admin.\n\n` +
        `*Final Results:*\n` +
        `✅ Yes votes: ${voteData.yesVotes}/${voteData.yesTarget}\n` +
        `❌ No votes: ${voteData.noVotes}/${voteData.noTarget}\n` +
        `👥 Total voters: ${voteData.voters.length}`,
      contextInfo: {
        mentionedJid: [target]
      }
    });
  }
}

export default handler;