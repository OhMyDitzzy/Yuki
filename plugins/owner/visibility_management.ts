import type { PluginHandler } from "@yuki/types";

let modeTimer: NodeJS.Timeout | null = null;

function parseDuration(timeStr: string): number | null {
  const match = timeStr.match(/^(\d+)([dmjh])$/i);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'd':
      return value * 1000;
    case 'm': 
      return value * 60 * 1000;
    case 'j':
      return value * 60 * 60 * 1000;
    case 'h':
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function formatDuration(timeStr: string): string {
  const match = timeStr.match(/^(\d+)([dmjh])$/i);
  if (!match) return timeStr;
  
  const value = match[1];
  const unit = match[2].toLowerCase();
  
  const unitNames: { [key: string]: string } = {
    'd': 'seconds',
    'm': 'minutes',
    'j': 'hours',
    'h': 'days'
  };
  
  return `${value} ${unitNames[unit]}`;
}

let handler: PluginHandler = {
  cmd: /^(self|public)/i,
  rowner: true,
  exec: async (m, { conn, command, args }) => {
    let isPublic = command === "public";
    let duration = args[0];

    if (modeTimer) {
      clearTimeout(modeTimer);
      modeTimer = null;
    }

    const targetModeName = !isPublic ? "self" : "public";

    if (duration) {
      const ms = parseDuration(duration);
      
      if (!ms) {
        return m.reply(
          `❌ Invalid duration format!\n\n` +
          `Correct format:\n` +
          `• 30d = 30 seconds\n` +
          `• 5m = 5 minutes\n` +
          `• 2j = 2 hours\n` +
          `• 1h = 1 day`
        );
      }

      const formattedDuration = formatDuration(duration);
      const currentMode = opts["self"] ? "self" : "public";
      modeTimer = setTimeout(() => {
        opts["self"] = !isPublic;
        modeTimer = null;
      }, ms);

      m.reply(
        `⏱️ Bot will change to *${targetModeName}* mode in ${formattedDuration}\n` +
        `📌 Current mode: *${currentMode}*`
      );
    } else {
      if (opts["self"] === !isPublic) {
        return conn!!.reply(
          m.chat, 
          `❌ Bot is already in ${targetModeName} mode`, 
          m
        );
      }

      opts["self"] = !isPublic;
      m.reply(`✅ Bot successfully changed to *${targetModeName}* mode`);
    }
  }
};

export default handler;