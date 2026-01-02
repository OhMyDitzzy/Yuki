import type { PluginHandler } from "@yuki/types";
import { generateWAMessageFromContent, proto } from "baileys"

let handler: PluginHandler = {
  name: "Vote Kick",
  description: "Cast a vote to kick a member",
  tags: ["group"],
  cmd: ["votekick", "vk"],
  group: true,
  botAdmin: true,
  exec: async (m, { conn, usedPrefix, text, command, args, checkTarget }) => {
    let sock = conn!!;

    sock.votekick = sock.votekick || {};

    if (args.length >= 2) {
      const targetUser = args[0];
      const action = args[1];

      const votekickTarget = Object.keys(sock.votekick).find(
        target => target === targetUser && sock.votekick[target].groupId === m.chat
      );

      if (!votekickTarget) {
        return;
      }

      const voteData = sock.votekick[votekickTarget];
      const hasVoted = voteData.voters.includes(m.sender);

      if (action === "yes") {
        if (hasVoted) {
          return;
        }

        voteData.vote += 1;
        voteData.voters.push(m.sender);

        if (voteData.vote >= 5) {
          try {
            await sock.groupParticipantsUpdate(
              voteData.groupId,
              [votekickTarget],
              "remove"
            );

            await sock.sendMessage(voteData.groupId, {
              text: `*VOTE KICK COMPLETED*\n@${votekickTarget.split("@")[0]} has been kicked from the group.\n\n✅ Total votes: ${voteData.vote}`,
              contextInfo: {
                mentionedJid: [votekickTarget]
              }
            });

            delete sock.votekick[votekickTarget];
          } catch (e) {
            await sock.sendMessage(voteData.groupId, {
              text: `*Failed to kick @${votekickTarget.split("@")[0]}*\nPlease check bot permissions.`,
              contextInfo: {
                mentionedJid: [votekickTarget]
              }
            });
            delete sock.votekick[votekickTarget];
          }
        }
      } else if (action === "no") {
        if (hasVoted) {
          voteData.vote -= 1;
          const voterIndex = voteData.voters.indexOf(m.sender);
          voteData.voters.splice(voterIndex, 1);
        }
        return;
      }

      return;
    }

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
          `Progress: (${sock.votekick[activeVoteInGroup].vote}/5)\n\n` +
          `Please complete or cancel the current vote first.`,
        contextInfo: {
          mentionedJid: [activeVoteInGroup]
        }
      });
    }

    if (!sock.votekick[who]) {
      sock.votekick[who] = {
        vote: 0,
        voters: [],
        groupId: m.chat,
        pollMsgId: null
      };
    }

    const pollOptions = [
      ["✅ Kick", `.vk ${who} yes`],
      ["❌ No", `.vk ${who} no`]
    ];
    
    const names = await sock.getName(who);

    const sentPoll = await sock.sendPoll(
      m.chat,
      `*VOTE KICK MEMBER ${names || 'A USER'}*\n\nVote to kick this member from the group.\nRequired: 5 votes`,
      pollOptions as any,
      {
        multiselect: false,
        selectableCount: 1,
        // @ts-ignore
        quoted: m
      }
    );
    
    let templategenerate = await generateWAMessageFromContent(m.chat, proto.Message.fromObject({pinInChatMessage: {
      key: sentPoll.key,
      type: 1,
      senderTimestampMs: new Date().getTime() / 1000
    }}), {})
    
    let templatenew = {
      messageContextInfo: { messageAddOnDurationInSecs: 604800 },
      ...templategenerate.message
    }
    
    await sock.relayMessage(m.chat, templatenew, { messageId: templategenerate.key.id })

    sock.votekick[who].pollMsgId = sentPoll.key.id;
  },
  before: async (m, { conn }) => {
    const votekicks = conn!!.votekick;
    if (!votekicks) return false;
    if (m.text !== "unvote") return false;
    
    const target = Object.keys(votekicks).find(jid =>
      votekicks[jid].groupId === m.chat
    );

    if (!target) return false;

    const voteData = votekicks[target];
    const hasVoted = voteData.voters.includes(m.sender);
    
    if (m.text === "unvote") {
      if (!hasVoted) return false
      voteData.vote -= 1;
      const voterIndex = voteData.voters.indexOf(m.sender);
      voteData.voters.splice(voterIndex, 1);
    }
    
    return true;
  }
}

export default handler;