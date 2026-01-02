import type { PluginHandler } from "@yuki/types";
import axios from "axios";

let handler: PluginHandler = {
  name: "Download TikTok videos",
  description: "Download TikTok videos easily",
  usage: [".tiktok <link>"],
  tags: ["downloader"],
  cmd: /^(tiktok|tt|tiktokdl|tiktoknowm)$/i,
  limit: true,
  register: true,
  exec: async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
      conn!!.sendPresenceUpdate("composing", m.chat)
      return conn!!.reply(m.chat, `*Example :* ${usedPrefix!! + command!!} https://vm.tiktok.com/xxxxx`, m)
    }
    if (!text.match(/tiktok/gi)) {
      return conn!!.reply(m.chat, 'Make sure the link is from TikTok', m)
    }

    conn!!.sendMessage(m.chat, {
      react: {
        text: '🕒',
        key: m.key,
      }
    });

    try {
      let p: any = await tiktok2(`${text}`);
      let tag = await await conn!!.sendFile(m.chat, p.no_watermark, 'tiktok.mp4', p.title, m);
      conn!!.sendMessage(m.chat, {
        audio: {
          url: `${p.music}`
        },
        mimetype: 'audio/mp4',
        fileName: `${p.title}.mp3`
      }, { quoted: tag })
      conn!!.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    } catch (e) {
      console.log(e);
      conn!!.sendMessage(m.chat, {
        react: {
          text: '❌',
          key: m.key,
        }
      });
      
      conn!!.error(m, e);
    }
  }
}

async function tiktok2(query: string) {
  return new Promise(async (resolve, reject) => {
    try {
      const encodedParams = new URLSearchParams();
      encodedParams.set('url', query);
      encodedParams.set('hd', '1');

      const response = await axios({
        method: 'POST',
        url: 'https://tikwm.com/api/',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': 'current_language=en',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
        },
        data: encodedParams
      });
      const videos = response.data.data;
      const result = {
        title: videos.title,
        cover: videos.cover,
        origin_cover: videos.origin_cover,
        no_watermark: videos.play,
        watermark: videos.wmplay,
        music: videos.music
      };
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

export default handler;
