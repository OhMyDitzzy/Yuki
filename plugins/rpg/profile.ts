import type { PluginHandler } from "@yuki/types";
import leveling from "libs/levelling"

let handler: PluginHandler = {
  name: "Info Profile",
  description: "Show user profile",
  tags: ["rpg"],
  register: true,
  exp: 0,
  cmd: ["profile", "pf"],
  exec: async (m, { conn }) => {
    try {
      let who: string = m.quoted ? m.quoted.sender : m.sender;

      let ppUrl = await conn.profilePictureUrl(who, 'image').catch((_) => "https://telegra.ph/file/2bf92f8497fddc063b203.jpg");

      let user = global.db.data.users[who];
      let username = user.name || await conn.getName(who);
      let age = user.age > 4000 ? 'Unknown' : user.age;
      let limit = user.premium ? '∞' : user.limit;
      let password = user.password ? shortText(user.password) : 'Not set';
      let { min } = leveling.xpRange(user.level, global.multiplier);
      let currentXp = user.exp - min;

      let caption = "*U S E R - P R O F I L E*\n\n";
      caption += `• *Username: ${username}*\n`
      caption += `• *Age: ${age}*\n`
      caption += `• *Limit: ${limit}*\n`
      caption += `• *Role: ${user.role}*\n`
      caption += `• *Level: ${user.level}*\n`
      caption += `• *Exp: ${user.exp} (Need ${currentXp} to level up)*\n`
      caption += `• *Password: ${password}*\n\n`
      caption += `*W A L L E T*\n\n`
      caption += `💵 *Balance: ${formatRupiah(user.money)}*\n`
      caption += `🪙 *Gold: ${user.gold || 'Unknown'}*\n`
      caption += `💎 *Diamond: ${user.diamond || 'Unknown'}*\n`

      conn.sendMessage(m.chat, {
        text: global.styles(caption),
        contextInfo: {
          mentionedJid: [m.sender],
          externalAdReply: {
            title: `Requested by ${m.name}`,
            body: `Profile user`,
            thumbnailUrl: ppUrl,
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: m })
    } catch (e) {
      conn.error(m, e);
    }
  }
}

export default handler;

function formatRupiah(number) {
  const formatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  });

  return formatter.format(number);
}

function shortText(text: string, limit = 2) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...";
}
