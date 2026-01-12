import type { PluginHandler } from "@yuki/types";
import { AIEnhancer } from "plugins/ai/ai_utils"

let handler: PluginHandler = {
  name: "Remove Background",
  description: "Remove background from image",
  register: true,
  limit: 5,
  cmd: ["rmbg", "removebg"],
  exec: async (m, { usedPrefix, command, conn }) => {
    let q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || '';

    if (!mime) throw `• *Send image with caption:* ${usedPrefix + command}`;

    if (!/image/.test(mime)) throw `• *The media you provided is not an image!*`;

    m.react("⏳");
    const ai = new AIEnhancer();
    try {
      const img = await q.download();
      const res = await ai.RemoveBackground(img);

      await conn.sendFile(m.chat, res.results.output, "rmbg.png", "✅ *Success*", m);
      m.react("✅");
    } catch (e) {
      m.react("❌");
      conn.error(m, e);
      console.log(e);
    }
  }
}

export default handler;
