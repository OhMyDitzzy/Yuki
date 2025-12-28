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

    let who = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : undefined);

    if (!who) throw `*Example:* ${usedPrefix + command!!} @target`;

    const { targetROwner, targetAdmin, targetRAdmin } = await checkTarget!!(who)

    if (targetAdmin || targetROwner || targetRAdmin || who === sock.user.lid) return m.reply("*Can't redirect to Admin, Owner, or Bot!*");

    if (!sock.votekick[who]) {
      sock.votekick[who] = { vote: 0 };
    } else {
      sock.votekick[who].vote += 1
    }

    if (sock.votekick[who].vote === 10) {
      try {
        await sock.groupParticipantsUpdate(m.chat, [who], "remove");
        delete sock.votekick[who];
        m.reply(
          `*VOTE KICK MEMBER @${who.split("@")[0]}*\nHave been kicked from the group.`,
        );
      } catch (e: any) {
        console.error("Error kicking member:", e);
      }
    } else {
      m.reply(
        `*VOTE KICK MEMBER* @${who.split("@")[0]}\n*(${sock.votekick[who].vote}/10)* Vote again and they will be kicked from the group!`,
      );
    }
  }
}

export default handler;
