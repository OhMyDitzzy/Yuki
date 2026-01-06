import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Vote Info",
  description: "Get information about active vote kick polling",
  tags: ["group"],
  cmd: ["voteinfo", "vi"],
  group: true,
  exec: async (m, { conn }) => {
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

    const yesVoters = voteData.voters
      .filter((v: any) => v.vote === 'yes')
      .map((v: any) => `@${v.jid.split("@")[0]}`)
      .join('\n');

    const noVoters = voteData.voters
      .filter((v: any) => v.vote === 'no')
      .map((v: any) => `@${v.jid.split("@")[0]}`)
      .join('\n');

    const allVoterJids = voteData.voters.map((v: any) => v.jid);

    const progressYes = Math.round((voteData.yesVotes / voteData.yesTarget) * 100);
    const progressNo = Math.round((voteData.noVotes / voteData.noTarget) * 100);

    const yesBar = '█'.repeat(Math.floor(progressYes / 10)) + '░'.repeat(10 - Math.floor(progressYes / 10));
    const noBar = '█'.repeat(Math.floor(progressNo / 10)) + '░'.repeat(10 - Math.floor(progressNo / 10));

    await sock.sendMessage(m.chat, {
      text: `*📊 VOTE KICK INFO*\n\n` +
        `*Target:* @${target.split("@")[0]} (${names || 'Unknown'})\n` +
        `*Poll ID:* ${voteData.pollMsgId}\n\n` +
        `*✅ YES VOTES* (${voteData.yesVotes}/${voteData.yesTarget})\n` +
        `${yesBar} ${progressYes}%\n` +
        `${yesVoters || '_No votes yet_'}\n\n` +
        `*❌ NO VOTES* (${voteData.noVotes}/${voteData.noTarget})\n` +
        `${noBar} ${progressNo}%\n` +
        `${noVoters || '_No votes yet_'}\n\n` +
        `*Total Voters:* ${voteData.voters.length}`,
      contextInfo: {
        mentionedJid: [target, ...allVoterJids]
      }
    });
  }
}

export default handler;