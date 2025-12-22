import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Media to sticker converter",
  description: "Convert media, whether video or image, into stickers",
  usage: [".s <reply-to-media>"],
  tags: ["media"],
  cmd: /^s(tic?ker)?(gif)?$/i,
  register: true,
  limit: 1,
  exec: async (m, { conn, text }) => {
    let q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || '';
    if (!q.mediaType || !/image|video|webp/.test(mime)) {
      return m.reply('Reply to images, videos, or stickers with the .s command to create stickers.');
    }
    const isVideoLike = /video|gif/.test(mime) || (q.mediaType === 'videoMessage');
    const seconds = Number(q.msg?.seconds || q.seconds || q.duration || 0);
    if (isVideoLike && seconds > 10) {
      return m.reply("Videos must be under 10 seconds long");
    }

    m.react("⏳");    
    let media: any;
    try {
      media = await q.download();
    } catch (e: any) {
      m.react("❌");
      return m.reply('Failed to fetch Media: ' + e.message);
    }

    let exif: any;
    if (text) {
      const [packname, author] = text.split(/[,|\-+&]/);
      exif = { packName: packname?.trim() || '', packPublish: author?.trim() || '' };
    }
    
    m.react("✅");
    return conn!!.sendSticker(m.chat, media, m, exif);
  }
}

export default handler;
