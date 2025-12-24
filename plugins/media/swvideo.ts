import type { PluginHandler } from "@yuki/types";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let handler: PluginHandler = {
  name: "Compress Video",
  description: "Compress video file without losing quality",
  tags: ["media"],
  usage: [".swvideo <reply-to-video> [caption]"],
  register: true,
  limit: true,
  cmd: ["swvideo", "compressvideo", "cv"],
  exec: async (m, { conn, usedPrefix, command, text, args }) => {
    if (!m.quoted) {
      throw `• *Reply to a video by sending the command:* ${usedPrefix + command}\n• *Example:* ${usedPrefix + command} my awesome caption`;
    }

    m.react("⏳");

    let mime = m.quoted.mimetype || "";
    
    if (!/video/.test(mime)) {
      throw `Reply to a video with caption *${usedPrefix + command}*`;
    }

    const tempId = Date.now();
    const inputPath = join(tmpdir(), `input_${tempId}.mp4`);
    const outputPath = join(tmpdir(), `output_${tempId}.mp4`);

    try {
      m.reply("📥 Downloading video...");
      let media = await m.quoted.download();
      
      if (!media || media.length === 0) {
        throw new Error("Failed to download video");
      }

      const originalSize = (media.length / 1024 / 1024).toFixed(2);
      
      await writeFile(inputPath, media);
      
      m.reply("🔍 Checking video duration...");
      const probeProc = Bun.spawn([
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        inputPath
      ], {
        stdout: "pipe"
      });
      
      await probeProc.exited;
      const durationOutput = await new Response(probeProc.stdout).text();
      const duration = parseFloat(durationOutput.trim());
      
      if (isNaN(duration)) {
        throw new Error("Failed to get video duration");
      }
      
      if (duration > 90) {
        await unlink(inputPath).catch(() => {});
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        throw `❌ Video is too long!\n\n📹 Video length: ${minutes}m ${seconds}s\n⏱️ Maximum: 1m 30s\n\nPlease use a shorter video.`;
      }     
       
      m.reply(`🎬 Compressing... (${originalSize} MB)`);  
              
      const proc = Bun.spawn([
        "ffmpeg",
        "-i", inputPath,
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "medium",
        "-c:a", "copy",
        "-y",
        outputPath
      ]);

      await proc.exited;

      const out = await readFile(outputPath);
      
      if (out.length === 0) throw new Error("Empty output");

      m.react("✅");

      let caption = text || args?.join(" ") || "";

      await conn!!.sendFile(m.chat, out, `compressed_${tempId}.mp4`, caption, m);

      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});

    } catch (e: any) {
      m.react("❌");
      
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
      
      if (typeof e === "string" && e.includes("too long")) {
        throw e;
      }
      
      throw `Failed to compress video. Please try again.`;
    }
  }
}

export default handler;