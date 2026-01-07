import type { PluginHandler } from "@yuki/types";
import axios from 'axios';
import { Readable } from 'stream';
import fs from "node:fs";

async function hdvid(videoPath: string) {
  const { default: FormData } = await import("form-data");
  let data = new FormData();
  data.append('video', fs.createReadStream(videoPath));

  const config = {
    method: 'POST',
    url: 'https://clara.biz.id/api/video-upscale',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
      'sec-ch-ua-platform': '"Android"',
      'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      'dnt': '1',
      'sec-ch-ua-mobile': '?1',
      'origin': 'https://clara.biz.id',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'referer': 'https://clara.biz.id/',
      'accept-language': 'id,en-US;q=0.9,en;q=0.8,ja;q=0.7,zh-CN;q=0.6,zh;q=0.5',
      'priority': 'u=1, i',
      ...data.getHeaders(),
    },
    data,
  };

  try {
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

let handler: PluginHandler = {
  name: "HD Video",
  description: "Enhance your video to make them clearer. (Powered by ESRGAN)",
  usage: [".hd <your-image>"],
  tags: ["media"],
  limit: 2,
  register: true,
  cmd: ["hdvid", "reminivid", "vidhd"],
  exec: async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || '';

    if (!mime)
      return conn!!.reply(m.chat, `Send/Reply video with the caption *${usedPrefix + command!!}*`, m);

    if (!/video/.test(mime))
      return conn!!.reply(m.chat, `Mime ${mime} is not supported`, m);
      
    m.react("⏳")
    try {
      const vid = await q.download();      
      const tmp = process.cwd() + `/tmp/tmp_${Date.now()}.mp4`;
      fs.writeFileSync(tmp, vid);
      const resp = await hdvid(tmp);
      
      await conn!!.sendFile(m.chat, resp.videoUrl, "hdvid.mp4", "✅ Successfully enhanced!", m);
      m.react("✅")
    } catch (e) {
      m.react("❌")
      conn.error(m, e);
      console.error(e)
    }
  }
};

export default handler;