import type { PluginHandler } from "@yuki/types";
import axios, { AxiosResponse } from "axios";

type EnhanceSize = "low" | "medium" | "high";

interface IhancerOptions {
  method?: 1 | 2 | 3 | 4;
  size?: EnhanceSize;
}

async function ihancer(
  buffer: Buffer,
  { method = 1, size = "low" }: IhancerOptions = {}
): Promise<Buffer> {
  const { default: FormData } = await import("form-data");

  const availableSizes: EnhanceSize[] = ["low", "medium", "high"];

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Image buffer is required");
  }

  if (method < 1 || method > 4) {
    throw new Error("Available methods: 1, 2, 3, 4");
  }

  if (!availableSizes.includes(size)) {
    throw new Error(`Available sizes: ${availableSizes.join(", ")}`);
  }

  const form = new FormData();
  form.append("method", method.toString());
  form.append("is_pro_version", "false");
  form.append("is_enhancing_more", "false");
  form.append("max_image_size", size);
  form.append("file", buffer, `${Date.now()}.jpg`);

  try {
    const response: AxiosResponse<ArrayBuffer> = await axios.post(
      "https://ihancer.com/api/enhance",
      form,
      {
        headers: {
          ...form.getHeaders(),
          "accept-encoding": "gzip",
          host: "ihancer.com",
          "user-agent": "Dart/3.5 (dart:io)",
        },
        responseType: "arraybuffer",
      }
    );

    return Buffer.from(response.data);
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw new Error(err.message);
    }
    throw new Error("Unknown error occurred");
  }
}

let handler: PluginHandler = {
  name: "HD Image",
  description: "Enhance your images to make them clearer.",
  usage: [".hd <your-image>"],
  tags: ["media"],
  limit: 2,
  register: true,
  cmd: ["hdr", "remini", "hd"],
  exec: async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || '';

    if (!mime)
      return conn!!.reply(m.chat, `Send/Reply Images with the caption *${usedPrefix + command!!}*`, m);

    if (!/image\/(jpe?g|png)/.test(mime))
      return conn!!.reply(m.chat, `Mime ${mime} is not supported`, m);
      
    m.react("⏳")
    try {
      const img = await q.download();
      const resp = await ihancer(img, { method: 1, size: "high" });
      
      await conn!!.sendFile(m.chat, resp, "hd.jpg", "", m);
      m.react("✅")
    } catch (e) {
      m.react("❌")
      conn.error(m, e);
      console.error(e)
    }
  }
};

export default handler;