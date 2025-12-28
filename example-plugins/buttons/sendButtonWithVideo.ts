import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  cmd: ["btnvid"],
  exec: async (m, { conn }) => {
    // Button with video attachment
    await conn!!.sendButtonWithVideo(
      m.chat,
      "https://example.com/video.mp4", // Video URL or Buffer
      "Check out this video!", // Caption text
      [
        {
          id: "watch_later",
          displayText: "⏰ Watch Later"
        },
        {
          id: "download",
          displayText: "⬇️ Download"
        }
      ],
      m,
      {
        footer: "Video button example"
      }
    );
  }
};

export default handler;