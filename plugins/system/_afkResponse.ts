import type { ExtendedWAMessage } from "types/extendWAMessage";

let handler: any = (m: any) => m;
handler.before = (m: ExtendedWAMessage) => {
  let user = global.db.data.users[m.sender];

  if (user.afk > -1) {
    m.reply(
      `• *You Stopped Afk* ${user.afkReason ? " \n*After :* " + user.afkReason : ""}
◦ *Afk Duration :* ${clockString(new Date() as any - user.afk)}
`.trim(),
    );

    user.afk = -1;
    user.afkReason = "";
  }

  let jids = [
    ...new Set([
      ...(m.mentionedJid || []),
      ...(m.quoted ? [m.quoted.sender] : []),
    ]),
  ];

  for (let jid of jids) {
    let user = global.db.data.users[jid];
    if (!user) continue;
    let afkTime = user.afk;
    if (!afkTime || afkTime < 0) continue;
    let reason = user.afkReason || "";
    m.reply(
      `
*Dont Tag Him/Her!*
*He/She is AFK ${reason ? "with reason :* " + reason : "with no reason*"}
*Afk Duration:* ${clockString(new Date() as any - afkTime)}
`.trim(),
    );
  }

  return true;
}

export default handler;

function clockString(ms: number) {
  let h = isNaN(ms) ? "--" : Math.floor(ms / 3600000);
  let m = isNaN(ms) ? "--" : Math.floor(ms / 60000) % 60;
  let s = isNaN(ms) ? "--" : Math.floor(ms / 1000) % 60;
  return [h, m, s].map((v) => v.toString().padStart(2)).join(":");
}

