import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Vote Kick",
  description: "Cast a vote to kick a member",
  tags: ["group"],
  cmd: ["votekick"],
  group: true,
  botAdmin: true,
  register: true,
  exec: async (m, { conn, usedPrefix, command, checkTarget }) => {
    let sock = conn!!;

    sock.votekick = sock.votekick || {};

    let who = (m.mentionedJid[0] || (m.quoted ? m.quoted.sender : undefined));

    if (!who) throw `*Example:* ${usedPrefix + command!!} @target`;

    const { targetROwner, targetAdmin, targetRAdmin } = await checkTarget!!(who);

    if (targetAdmin || targetROwner || targetRAdmin) 
      return m.reply("*Can't redirect to Admin, Owner, or Bot!*");

    const activeVoteInGroup = Object.keys(sock.votekick).find(target => {
      return sock.votekick[target].groupId === m.chat;
    });


    if (activeVoteInGroup && activeVoteInGroup !== who) {
      return await sock.sendMessage(m.chat, {
        text: `*There is already an active vote in this group!*\n` +
          `Target: @${activeVoteInGroup.split("@")[0]}\n` +
          `Progress: (${sock.votekick[activeVoteInGroup].vote}/10)\n\n` +
          `Please complete or cancel the current vote first.`,
        contextInfo: {
          mentionedJid: [activeVoteInGroup]
        }
      });
    }

    if (activeVoteInGroup) {
      const hasVoted = sock.votekick[activeVoteInGroup].voters.includes(m.sender);
      if (hasVoted) {
        return m.reply("*You have already voted in this group!*\nWait until the current vote is completed.");
      }
    }

    if (!sock.votekick[who]) {
      sock.votekick[who] = { 
        vote: 0,
        voters: [],
        groupId: m.chat
      };
    }

    sock.votekick[who].vote += 1;
    sock.votekick[who].voters.push(m.sender);

    if (sock.votekick[who].vote === 10) {
      try {
        await sock.groupParticipantsUpdate(m.chat, [who], "remove");
        delete sock.votekick[who];
        
        await sock.sendMessage(m.chat, {
          text: `*VOTE KICK MEMBER @${who.split("@")[0]}*\nHave been kicked from the group.`,
          contextInfo: {
            mentionedJid: [who]
          }
        });
      } catch (e: any) {
        console.error("Error kicking member:", e);
        await sock.sendMessage(m.chat, {
          text: `*Failed to kick @${who.split("@")[0]}*\nPlease check bot permissions.`,
          contextInfo: {
            mentionedJid: [who]
          }
        });
      }
    } else {
      await sock.sendMessage(m.chat, {
        text: `*VOTE KICK MEMBER* @${who.split("@")[0]}\n*(${sock.votekick[who].vote}/10)* votes collected!\n\nVoters: ${sock.votekick[who].voters.length} member(s)`,
        contextInfo: {
          mentionedJid: [who]
        }
      });
    }
  }
}

export default handler;