import levelling from "libs/levelling";
import canvafy from "canvafy";

export async function before(m, { conn }) {
  const user = global.db.data.users[m.sender];
  
  if (!user.autolevelup) return !0;
  
  let ppUrl: string;
  try {
    ppUrl = await conn.profilePictureUrl(m.sender, 'image');
  } catch {
    ppUrl = "https://telegra.ph/file/0a70ee52eb457fbcc2b92.jpg";
  }

  const ppResponse = await fetch(ppUrl);
  const ppBuffer = await ppResponse.arrayBuffer();
  const pp = Buffer.from(ppBuffer);

  const before = user.level * 1;
  
  while (levelling.canLevelUp(user.level, user.exp, global.multiplier)) {
    console.log("Leveling up from", user.level, "to", user.level + 1);
    user.level++;
  }

  if (before !== user.level) {
    const name = user.name;

    const { min, max } = levelling.xpRange(user.level, global.multiplier);
    const currentXp = user.exp - min;
    const requiredXp = max - min;
    let chating = `乂  *L E V E L  U P*\n\n`;
    chating += `┌  ◦ *Progress* : [ ${before} ] ➠ [ ${user.level} ]\n`;
    chating += `└  ◦ *Unlocked* : ${user.role}\n\n`;

    const rank = new canvafy.Rank()
      .setAvatar(pp)
      .setLevel(user.level, "RANK")
      .setRank(user.level, "LEVEL")
      .setLevelColor("#2B2E35", "#2B2E35")
      .setRankColor("#FFFFFF", "#6636E5")
      .setCurrentXp(currentXp >= 0 ? currentXp : 0)
      .setRequiredXp(requiredXp)
      .setStatus("stream")
      .setBarColor("#6636E5")
      .setUsername(user.name);

    rank.build().then(data => {
      conn.sendFile(m.chat, data, `RankCard-${name}.png`, chating, m);
    }).catch(e => {
      console.error('Error building rank card:', e);
    });
  }
  
  return !0;
}