import type { PluginHandler } from "@yuki/types";

let handler: PluginHandler = {
  name: "Convert sticker/audio to video",
  description: "Convert a sticker or audio to video",
  usage: [".tovideo <reply-to-sticker>"],
  tags: ["media"],
  register: true,
  limit: true,
  cmd: ["tovideo", "tovidio", "tovid"],
  exec: async (m, { conn, usedPrefix, command }) => {
    if (!m.quoted) throw `• *Reply to the sticker or audio by sending the command:* ${usedPrefix + command!!}`;
    
    m.react("⏳");
    
    let mime = m.quoted.mimetype || "";
    if (!/webp|audio/.test(mime)) throw `Reply sticker or audio with caption *${usedPrefix + command!!}*`;

    let media = await m.quoted.download();
    let out = Buffer.alloc(0);

    try {
      if (/webp/.test(mime)) {
        const proc = Bun.spawn([
          "ffmpeg",
          "-i", "pipe:0",
          "-c:v", "libx264", 
          "-pix_fmt", "yuv420p", 
          "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-movflags", "+faststart",
          "-f", "mp4",
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

      } else if (/audio/.test(mime)) {
        const proc = Bun.spawn([
          "ffmpeg",
          "-i", "pipe:0",
          "-filter_complex", "color=c=black:s=1280x720:r=25",
          "-pix_fmt", "yuv420p",
          "-crf", "51",
          "-c:a", "copy", 
          "-shortest", 
          "-movflags", "+faststart",
          "-f", "mp4",
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
      }

      if (out.length === 0) {
        throw new Error("Conversion failed - empty output");
      }

      m.react("✅");
      await conn!!.sendFile(m.chat, out, `video-${Date.now()}.mp4`, "Success!", m);

    } catch (e: any) {
      console.error("FFmpeg error:", e);
      m.react("❌");
      throw `Failed to convert to video: ${e.message}`;
    }
  }
}

export default handler;