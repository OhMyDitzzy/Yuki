import type { PluginHandler } from "@yuki/types";

import SaveTubeClient, { type DownloadResponse, type VideoInfo } from "plugins/downloader/downloader_utils/youtube";

type MediaType = 'video' | 'audio' | undefined;
const client = new SaveTubeClient();

let handler: PluginHandler = {
  name: "YouTube Downloader",
  description: "Download a Video/Audio from YouTube",
  tags: ["downloader"],
  usage: [".yt <link> <type>"],
  cmd: ["yt", "youtube"],
  limit: true,
  register: true,
  exec: async (m, { conn, args, usedPrefix, command }) => {
    const url = args!![0] as string
    const type = args!![1] as MediaType

    if (!url && !type) throw `❌ Url and type are not available, Use the command: ${usedPrefix + command!!} <youtube-url> <video or audio>`;

    if (type !== "audio" && type !== "video") throw `❌ Invalid format! Use: audio or video`;

    m.react("⏳");

    try {
      const info = await client.getVideoInfo(url!!) as VideoInfo;
      const media = await client.getDownload((info as VideoInfo).key, type!!);

      if (type === "video") {        
        conn?.sendFile(m.chat, (media as DownloadResponse).downloadUrl, `video-${new Date().toISOString()}.mp4`, ``, m);
        m.react("✅")
      }

      if (type === "audio") {
        conn?.sendMessage(m.chat, {
          audio: {
            url: (media as DownloadResponse).downloadUrl
          },
          mimetype: 'audio/mp4',
          fileName: `${(info as VideoInfo).title}.mp3`,
        }, { quoted: m })
        m.react("✅")
      }
    } catch (e: any) {
      m.react("❌");
      console.error(e)
    }
  }
}

export default handler;
