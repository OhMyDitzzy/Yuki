import type { PluginHandler } from "@yuki/types";
import { prepareWAMessageMedia } from "baileys";
import moment from "moment-timezone";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import canvafy from "canvafy";
import type { ListV2 } from "types/buttons/interactive_message_button";
import leveling from "libs/levelling";

function greetings(): string {
  const time = parseInt(moment.tz("Asia/Jakarta").format("HH"));
  if (time >= 4 && time < 10) return "Good Morning🌤️";
  if (time >= 10 && time < 15) return "Good afternoon🌞";
  if (time >= 15 && time < 18) return "Good afternoon🌄";
  return "Good night🌃";
}

const tagDisplayNames: Record<string, string> = {
  public: "Public 🌐",
  downloader: "Downloader 📂",
  media: "Media 🎬",
  tools: "Tools 🛠️",
  info: "Info ℹ️",
  admin: "Admin 🛡️",
  group: "Group 👥",
  search: "Search 🔍",
  ai: "AI 🤖",
  fun: "Fun 🎮",
  rpg: "RPG ⚔️",
  sticker: "Sticker 🎨",
  convert: "Convert 🔄",
  database: "Database 💾",
  premium: "Premium 💎",
  internet: "Internet 🌍",
  anime: "Anime 🎌",
  islamic: "Islamic ☪️",
  game: "Game 🎯"
};

interface PluginInfo {
  name: string;
  description: string;
  tags: string[];
  enabled: boolean;
  usage: string;
  cmd: string[];
}

function extractCommands(cmd: any): string[] {
  if (Array.isArray(cmd)) {
    return cmd.flatMap(c => extractCommands(c));
  }
  if (typeof cmd === "string") {
    return [cmd];
  }
  if (cmd instanceof RegExp) {
    const pattern = cmd.source;
    const orMatch = pattern.match(/^\^?\(([^)]+)\)\$?/);
    if (orMatch) {
      return orMatch[1]!!.split('|').map(c => c.trim());
    }
    const match = pattern.match(/^\^?([a-z0-9_-]+)/i);
    if (match) return [match[1]!!];
  }
  return [];
}

let handler: PluginHandler = {
  name: "Menu Bot",
  description: "Show menu list",
  cmd: ["menu", "help"],
  tags: ["public"],
  register: true,
  exec: async (m, { conn, text, usedPrefix = "." }) => {
    try {
      let packageInfo: any = {};
      try {
        const pkgPath = join(process.cwd(), "package.json");
        packageInfo = JSON.parse(readFileSync(pkgPath, "utf-8"));
      } catch {
        packageInfo = { version: "1.0.0" };
      }

      const registered = global.db?.data?.users?.[m.sender]?.registered || false;
      const name = registered
        ? global.db.data.users[m.sender].name
        : conn?.getName(m.sender) || "User";

      let payment = { "key": { "remoteJid": "0@s.whatsapp.net", "fromMe": false }, "message": { "requestPaymentMessage": { "currencyCodeIso4217": "USD", "amount1000": "99999999999", "requestFrom": "0@s.whatsapp.net", "noteMessage": { "extendedTextMessage": { "text": `${name}-san 🐼`, "contextInfo": { "mentionedJid": [`${m.sender}`] } } }, "expiryTimestamp": "0", "amount": { "value": "99999999999", "offset": 1000, "currencyCode": "USD" } } } }

      const metadataMap = global.commandCache.getMetadata();
      let ppUrl: any = await conn!!.profilePictureUrl(m.sender, 'image').catch(() => "https://telegra.ph/file/1dff1788814dd281170f8.jpg");
      let user = global.db.data.users[m.sender];

      let { min, max } = leveling.xpRange(user.level, global.multiplier);
      let currentXp = user.exp - min;
      let requiredXp = max - min;

      if (currentXp < 0) currentXp = 0;
      if (currentXp < 0) requiredXp = 0;

      const rankBuffer = await new canvafy.Rank()
        .setAvatar(ppUrl)
        .setBackground("image", "https://telegra.ph/file/98225485a33fc4a5b47b2.jpg")
        .setRank(user.level, "LEVEL")
        .setBorder("#fff")
        .setUsername(`${name}`)
        .setCurrentXp(currentXp, "#000")
        .setRequiredXp(requiredXp, "#000")
        .setRankColor({ text: "#fff", number: "#fff" } as any)
        .build();

      const allPlugins: PluginInfo[] = [];
      for (const [pluginName, metadata] of metadataMap.entries()) {
        const plugin = global.plugins[pluginName];
        if (!plugin || plugin.disabled) continue;

        const commands = extractCommands(plugin.cmd);
        if (commands.length > 0) {
          allPlugins.push({
            name: metadata.name,
            description: metadata.description,
            tags: metadata.tags,
            usage: metadata.usage,
            cmd: commands
          } as any);
        }
      }

      const groupedByTag: Record<string, PluginInfo[]> = {};
      allPlugins.forEach(plugin => {
        plugin.tags.forEach((tag: string) => {
          const tagKey = tag.toLowerCase();
          if (!groupedByTag[tagKey]) {
            groupedByTag[tagKey] = [];
          }
          groupedByTag[tagKey].push(plugin);
        });
      });

      m.react("⏳")
      const sections: ListV2["sections"] = [];

      if (!text) {
        let headerText = `My name is *Yuki*! I am an automated system (WhatsApp Bot) that can help you do things, search for, and obtain data/information only through WhatsApp.\n\n`;
        headerText += `╭───────────────────\n`;
        headerText += `│ *Bot Information*\n`;
        headerText += `│ • System: baileys (md)\n`;
        headerText += `│ • Total Features: ${allPlugins.length}\n`;
        headerText += `│ • Version: ${packageInfo.version || "1.0.0"}\n`;
        const cacheStats = global.commandCache.getStats();
        headerText += `│ • Cached Commands: ${cacheStats.total}\n`;
        headerText += `╰───────────────────\n\n`;
        headerText += `╭───────────────────\n`;
        headerText += `│ *User Information*\n`;
        headerText += `│ • Role: ${user.role}\n`;
        headerText += user.staffRole ? `│ • Staff Role: ${user.staffRole}\n` : '';
        headerText += `│ • Level: ${user.level}\n`;
        headerText += `│ • Limit: ${user.limit}\n`;
        headerText += `╰───────────────────\n\n`;
        headerText += `💡 *Select a category below to see features!*`;

        const tagRows = Object.entries(groupedByTag).map(([tag, plugins]) => {
          const displayTag = tagDisplayNames[tag] || `${tag.charAt(0).toUpperCase() + tag.slice(1)} 📌`;
          return {
            title: displayTag,
            description: `${plugins.length} features available in this category`,
            id: `${usedPrefix}menu ${tag}`
          };
        });

        sections.push({
          title: "📋 Feature Categories",
          highlight_label: `${Object.keys(groupedByTag).length} categories`,
          rows: tagRows
        });

        const list: ListV2 = {
          title: "🎯 Select Category",
          sections
        };

        await conn?.sendListV2(
          m.chat,
          {
            contextInfo: {
              mentionedJid: [m.sender],
              isForwarded: true,
              forwardingScore: 99999999,
              externalAdReply: {
                title: "Yuki Botz",
                body: packageInfo.version,
                thumbnailUrl: global.thumb,
                sourceUrl: global.sourceUrl,
                mediaType: 1,
                renderLargerThumbnail: true
              }
            },
            body: {
              text: headerText
            },
            header: {
              title: `Hi @${m.sender.replace(/@.+/g, '')}! ${greetings()}`,
              subtitle: `Version ${packageInfo.version || "1.0.0"}`,
              hasMediaAttachment: true, ...(await prepareWAMessageMedia({ document: { url: "https://wa.me/" }, mimetype: global.doc, fileName: "Yuki_Botz", jpegThumbnail: await conn!.resize(rankBuffer as any, 300, 100), fileLength: 100000000000 } as any, { upload: conn.waUploadToServer }))
            },
            footer: {
              text: `Type ${usedPrefix}menu <tag> to see features in a category`
            }
          },
          list,
          { userJid: conn.user.id, quoted: payment as any }
        );

        m.react("✅");
        return;
      }

      const tagQuery = text.toLowerCase().replace(/-page\d+$/, "");
      const pageMatch = text.match(/-page(\d+)$/);
      const currentPage = pageMatch ? parseInt(pageMatch[1]!!) - 1 : 0;

      const filteredPlugins = allPlugins.filter(plugin =>
        plugin.tags.some((tag: string) => tag.toLowerCase().includes(tagQuery))
      );

      if (filteredPlugins.length === 0) {
        await conn?.reply(m.chat, `❌ Cannot find features with tag "${tagQuery}"`, m);
        return;
      }

      const ITEMS_PER_PAGE = 10;
      const totalPages = Math.ceil(filteredPlugins.length / ITEMS_PER_PAGE);
      const startIdx = currentPage * ITEMS_PER_PAGE;
      const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, filteredPlugins.length);
      const pagePlugins = filteredPlugins.slice(startIdx, endIdx);

      const displayTag = tagDisplayNames[tagQuery] || `${tagQuery.charAt(0).toUpperCase() + tagQuery.slice(1)} 📌`;
      const sectionTitle = totalPages > 1
        ? `${displayTag} (Page ${currentPage + 1}/${totalPages})`
        : displayTag;

      const rows = pagePlugins.map((plugin: PluginInfo) => {
        const commands = plugin.cmd.map((c: string) => `${usedPrefix}${c}`).join(" / ");
        const displayUsage = plugin.usage || commands;
        return {
          title: plugin.name,
          description: `${plugin.description}\n📝 ${displayUsage}`,
          id: plugin.cmd[0] ? `${usedPrefix}${plugin.cmd[0]}` : `${usedPrefix}help`
        };
      });

      if (currentPage < totalPages - 1) {
        rows.push({
          title: "📄 Show More",
          description: `See ${filteredPlugins.length - endIdx} more features`,
          id: `${usedPrefix}menu ${tagQuery}-page${currentPage + 2}`
        });
      }

      sections.push({
        title: sectionTitle,
        highlight_label: `${pagePlugins.length} features`,
        rows
      });

      let headerText = `╭───────────────────\n`;
      headerText += `│ 📊 *Category Info*\n`;
      headerText += `│ • Total Features: ${filteredPlugins.length}\n`;
      headerText += `│ • Showing: ${startIdx + 1}-${endIdx}\n`;
      headerText += `│ • Page: ${currentPage + 1}/${totalPages}\n`;
      headerText += `╰───────────────────\n\n`;
      headerText += `💡 *Select a feature below!*`;

      m.react("⏳")
      const list: ListV2 = {
        title: "🎯 Select Feature",
        sections
      };

      await conn?.sendListV2(
        m.chat,
        {
          body: {
            text: headerText
          },
          header: {
            title: `${displayTag}`,
            subtitle: `Page ${currentPage + 1}/${totalPages}`,
            hasMediaAttachment: false
          },
          footer: {
            text: `Type ${usedPrefix}menu to go back to categories`
          }
        },
        list,
        { userJid: conn.user.id, quoted: m }
      );
      m.react("✅")
    } catch (e) {
      console.error("Error in menu plugin:", e);
      await conn?.reply(m.chat, "❌ Sorry, an error occurred while executing the menu command.", m);
      throw e;
    }
  }
};

export default handler;
