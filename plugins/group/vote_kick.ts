import type { PluginHandler } from "@yuki/types";
import { generateWAMessageFromContent, proto } from "baileys"

let handler: PluginHandler = {
  name: "Vote Kick",
  description: "Cast a vote to kick a member",
  tags: ["group"],
  cmd: ["votekick", "vk"],
  group: true,
  botAdmin: true,
  exec: async (m, { conn, usedPrefix, command, args, checkTarget }) => {
    let sock = conn!!;

    sock.votekick = sock.votekick || {};

    if (args.length >= 2 && !args[0].includes('|')) {
      const targetUser = args[0];
      const action = args[1];

      const votekickTarget = Object.keys(sock.votekick).find(
        target => target === targetUser && sock.votekick[target].groupId === m.chat
      );

      if (!votekickTarget) {
        return;
      }

      const voteData = sock.votekick[votekickTarget];
      const hasVoted = voteData.voters.some((v: any) => v.jid === m.sender);

      if (action === "yes") {
        if (hasVoted) {
          return;
        }

        voteData.yesVotes += 1;
        voteData.voters.push({ jid: m.sender, vote: 'yes' });

        if (voteData.yesVotes >= voteData.yesTarget) {
          try {
            await sock.groupParticipantsUpdate(
              voteData.groupId,
              [votekickTarget],
              "remove"
            );

            await sock.sendMessage(voteData.groupId, {
              text: `*✅ VOTE KICK COMPLETED*\n@${votekickTarget.split("@")[0]} has been kicked from the group.\n\n✅ Yes votes: ${voteData.yesVotes}/${voteData.yesTarget}\n❌ No votes: ${voteData.noVotes}/${voteData.noTarget}`,
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
          return;
        }

        voteData.noVotes += 1;
        voteData.voters.push({ jid: m.sender, vote: 'no' });

        if (voteData.noVotes >= voteData.noTarget) {
          await sock.sendMessage(voteData.groupId, {
            text: `*❌ VOTE KICK CANCELLED*\nVote to kick @${votekickTarget.split("@")[0]} has been cancelled.\n\n✅ Yes votes: ${voteData.yesVotes}/${voteData.yesTarget}\n❌ No votes: ${voteData.noVotes}/${voteData.noTarget}`,
            contextInfo: {
              mentionedJid: [votekickTarget]
            }
          });

          delete sock.votekick[votekickTarget];
        }
      }

      return;
    }

    let who = (m.mentionedJid[0] || (m.quoted ? m.quoted.sender : undefined));
    let yesTarget = 5;
    let noTarget = 3;

    if (args.length > 0 && args[0].includes('|')) {
      const targets = args[0].split('|');
      yesTarget = Math.max(2, parseInt(targets[0]) || 5);
      noTarget = Math.max(2, parseInt(targets[1]) || 3);
    } else if (args.length > 1 && args[1].includes('|')) {
      // User mentioned someone, vote targets are in second arg
      const targets = args[1].split('|');
      yesTarget = Math.max(2, parseInt(targets[0]) || 5);
      noTarget = Math.max(2, parseInt(targets[1]) || 3);
    }

    if (!who) throw `*Example:*\n${usedPrefix + command!!} @target 10|5\n${usedPrefix + command!!} 10|5 (reply to message)\n\n*Note:* Minimum vote target is 2`;

    const { targetROwner, targetRAdmin } = await checkTarget!!(who);

    if (targetROwner || targetRAdmin)
      return m.reply("*Can't target Admin, Owner, or Bot!*");

    const activeVoteInGroup = Object.keys(sock.votekick).find(target => {
      return sock.votekick[target].groupId === m.chat;
    });

    if (activeVoteInGroup && activeVoteInGroup !== who) {
      const activeVote = sock.votekick[activeVoteInGroup];
      return await sock.sendMessage(m.chat, {
        text: `*There is already an active vote in this group!*\n` +
          `Target: @${activeVoteInGroup.split("@")[0]}\n` +
          `Progress:\n` +
          `✅ Yes: ${activeVote.yesVotes}/${activeVote.yesTarget}\n` +
          `❌ No: ${activeVote.noVotes}/${activeVote.noTarget}\n\n` +
          `Please complete or cancel the current vote first.`,
        contextInfo: {
          mentionedJid: [activeVoteInGroup]
        }
      });
    }

    if (!sock.votekick[who]) {
      sock.votekick[who] = {
        yesVotes: 0,
        noVotes: 0,
        yesTarget: yesTarget,
        noTarget: noTarget,
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
      `*VOTE KICK MEMBER ${names || 'A USER'}*\n\nVote to kick this member from the group.\n\n✅ Required Yes votes: ${yesTarget}\n❌ Required No votes to cancel: ${noTarget}`,
      pollOptions as any,
      {
        multiselect: false,
        selectableCount: 1,
        // @ts-ignore
        quoted: m
      }
    );

    let templategenerate = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
      pinInChatMessage: {
        key: sentPoll.key,
        type: 1,
        senderTimestampMs: new Date().getTime() / 1000
      }
    }), {} as any)

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
    const voter = voteData.voters.find((v: any) => v.jid === m.sender);

    if (!voter) return false;

    if (voter.vote === 'yes') {
      voteData.yesVotes -= 1;
    } else if (voter.vote === 'no') {
      voteData.noVotes -= 1;
    }

    const voterIndex = voteData.voters.findIndex((v: any) => v.jid === m.sender);
    voteData.voters.splice(voterIndex, 1);

    return true;
  }
}

export default handler;