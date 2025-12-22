import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Convert sticker to image",
  description: "Convert a sticker to image",
  tags: ["media"],
  usage: [".toimg <reply-to-sticker>"],
  register: true,
  limit: true,
  cmd: ["toimg"],
  exec: async (m, { conn, usedPrefix, command }) => {
    if (!m.quoted) throw `• *Reply to the sticker by sending the command:* ${usedPrefix + command!!}`;
    m.react("⏳");
    let mime = m.quoted.mimetype || "";
    if (!/webp/.test(mime)) throw `Reply sticker with caption *${usedPrefix + command!!}*`;

    let media = await m.quoted.download();
    let out = Buffer.alloc(0);

    if (/webp/.test(mime)) {
      try {
        const proc = Bun.spawn([
          "ffmpeg",
          "-i", "pipe:0",
          "-vcodec", "png",
          "-f", "image2pipe",
          "-vframes", "1",
          "pipe:1"
        ], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        });

        proc.stdin.write(media);
        proc.stdin.end();

        out = Buffer.from(await new Response(proc.stdout).arrayBuffer());
        await proc.exited;

        if (out.length === 0) {
          throw new Error("Conversion failed - empty output");
        }
      } catch (e: any) {
        console.error("FFmpeg error:", e);
        m.react("❌");
        throw `Failed to convert sticker: ${e.message}`;
      }
    }

    m.react("✅");
    await conn!!.sendFile(m.chat, out, `sticker-${Date.now().toTimeString()}.png`, "Success!", m);
  }
}

export default handler;
