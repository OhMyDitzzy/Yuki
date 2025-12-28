import type { PluginHandler } from "@yuki/types";
import { fileTypeFromBuffer } from "file-type";
import { imageToWebp } from "libs/exif";
import sharp from "sharp";
import { randomBytes } from 'crypto';
import ff from 'fluent-ffmpeg';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let handler: PluginHandler = {
  name: "Get Telegram Stickers",
  description: "Get telegram stickers.",
  tags: ["media"],
  limit: true,
  register: true,
  cmd: /^(stic?kertele(gram)?)$/i,
  exec: async (m, { args, usedPrefix, command, conn }) => {
    if (!args?.[0]) throw `• *Example :* ${usedPrefix + command!!} https://t.me/addstickers/namepack`;
    if (!args!![0].match(/(https:\/\/t.me\/addstickers\/)/gi)) throw `❌ The URL you submitted is incorrect`;

    conn!!.stickerTeleProcessing = conn!!.stickerTeleProcessing || {};

    if (conn!!.stickerTeleProcessing[m.sender]) {
      return m.reply(`⚠️ *You are already processing a sticker pack!*\n\nPlease wait until your current request is completed.`);
    }
    
    if (Object.keys(conn.stickerTeleProcessing).length > 0) {
       return m.reply("⚠️ *Another user is currently processing a sticker pack, please wait until the process is complete!*");
    }

    m.react("⏳");

    let packName = args[0].replace("https://t.me/addstickers/", "");
    const botToken = "7935827856:AAGdbLXArulCigWyi6gqR07gi--ZPm7ewhc";

    let stickerSet = await fetch(`https://api.telegram.org/bot${botToken}/getStickerSet?name=${encodeURIComponent(packName)}`);

    if (!stickerSet.ok) throw `Response from Telegram API is not ok`;

    let json: any = await stickerSet.json();

    if (!json.ok) throw `❌ Sticker pack not found or an error occurred`;

    conn!!.stickerTeleProcessing[m.sender] = {
      packName,
      startTime: Date.now(),
      chatId: m.chat
    };

    try {
      const totalStickers = json.result.stickers.length;
      const MAX_STICKERS_PER_PACK = 60;
      const needsSplit = totalStickers > MAX_STICKERS_PER_PACK;
      const numberOfPacks = needsSplit ? Math.ceil(totalStickers / MAX_STICKERS_PER_PACK) : 1;

      m.reply(`*Pack:* ${json.result.title || packName}
*Total stiker:* ${totalStickers}
${needsSplit ? `*Will be split into:* ${numberOfPacks} packs (max 60 stickers each)\n` : ''}*Estimated completion:* ${Math.ceil(totalStickers * 1.5)} seconds

_Processing sticker packs, this might take a while..._`.trim());

      const MAX_SIZE = 1 * 1024 * 1024;

      const downloadBuffer = async (url: string): Promise<Buffer> => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      };

      const getVideoDuration = async (filePath: string): Promise<number> => {
        return new Promise((resolve) => {
          ff.ffprobe(filePath, (err, metadata) => {
            if (err) {
              resolve(3);
              return;
            }

            const duration = metadata.format.duration || 0;

            if (duration < 0.1 || !isFinite(duration)) {
              resolve(3);
            } else {
              resolve(duration);
            }
          });
        });
      };

      const videoToWebpCompressed = async (buffer: Buffer): Promise<Buffer> => {
        const tmpFileIn = join(process.cwd() + "/tmp/", `${randomBytes(6).readUIntLE(0, 6).toString(36)}.webm`);
        const tmpFileOut = join(process.cwd() + "/tmp/", `${randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);

        await Bun.write(tmpFileIn, buffer);

        try {
          let duration = await getVideoDuration(tmpFileIn);

          if (duration < 0.1 || !isFinite(duration)) {
            duration = 3;
          }

          const maxDuration = Math.min(duration, 9);

          const convertWithOptions = async (options: {
            scale: number;
            fps: number;
            quality: number;
            maxDur: number;
          }): Promise<Buffer> => {
            const safeDuration = Math.max(0.5, options.maxDur);

            const cmd = [
              'ffmpeg',
              '-y',
              `-i "${tmpFileIn}"`,
              '-vcodec libwebp',
              '-lossless 0',
              `-q:v ${options.quality}`,
              '-compression_level 6',
              '-preset fast',
              '-loop 0',
              '-an',
              '-vsync 0',
              `-t ${safeDuration.toFixed(2)}`,
              `-vf "scale=${options.scale}:${options.scale}:force_original_aspect_ratio=decrease,format=rgba,pad=${options.scale}:${options.scale}:(ow-iw)/2:(oh-ih)/2:color=#00000000,fps=${options.fps}"`,
              `"${tmpFileOut}"`
            ].join(' ');

            await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
            await new Promise(r => setTimeout(r, 500));

            const outputFile = Bun.file(tmpFileOut);

            if (!(await outputFile.exists())) {
              throw new Error('Output file not created');
            }

            const fileSize = await outputFile.size;

            if (fileSize === 0) {
              throw new Error('Output file is 0 bytes');
            }

            const resultBuffer = Buffer.from(await outputFile.arrayBuffer());
            await outputFile.delete();

            return resultBuffer;
          };

          const attempts = [
            { scale: 480, fps: 12, quality: 50 },
            { scale: 480, fps: 10, quality: 40 },
            { scale: 450, fps: 8, quality: 35 },
            { scale: 420, fps: 8, quality: 30 },
            { scale: 400, fps: 7, quality: 25 },
            { scale: 380, fps: 6, quality: 20 },
            { scale: 350, fps: 5, quality: 18 }
          ];

          let buff: Buffer | null = null;

          for (let i = 0; i < attempts.length; i++) {
            const attempt = attempts[i];

            try {
              buff = await convertWithOptions({
                ...attempt,
                maxDur: maxDuration
              } as any);

              if (buff.length <= MAX_SIZE) {
                return buff;
              }
            } catch (error) {
              if (i === attempts.length - 1) {
                throw error;
              }
              continue;
            }
          }

          if (buff && buff.length > MAX_SIZE) {
            throw new Error(`Cannot compress below 1MB after all attempts (current: ${(buff.length / 1024 / 1024).toFixed(2)}MB)`);
          }

          return buff!;

        } finally {
          try {
            await Bun.file(tmpFileIn).delete().catch(() => { });
            await Bun.file(tmpFileOut).delete().catch(() => { });
          } catch (e) { }
        }
      };

      const compressWebP = async (buffer: Buffer, isAnimated: boolean = false): Promise<Buffer> => {
        let result = buffer;

        const attempts = [
          { quality: 35, size: 512 },
          { quality: 25, size: 512 },
          { quality: 20, size: 480 },
          { quality: 15, size: 450 }
        ];

        for (let attempt of attempts) {
          if (result.length <= MAX_SIZE) break;

          if (isAnimated) {
            result = await sharp(buffer, { animated: true })
              .resize(attempt.size, attempt.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
              .webp({ quality: attempt.quality, effort: 3 })
              .toBuffer();
          } else {
            result = await sharp(buffer)
              .resize(attempt.size, attempt.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
              .webp({ quality: attempt.quality, effort: 3 })
              .toBuffer();
          }
        }

        if (result.length > MAX_SIZE) {
          throw new Error(`Cannot compress sticker below 1MB (current: ${(result.length / 1024 / 1024).toFixed(2)}MB)`);
        }

        return result;
      };

      let coverBuffer: Buffer | null = null;

      for (let sticker of json.result.stickers) {
        if (sticker.is_animated || sticker.is_video) continue;

        try {
          let coverFile = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${sticker.thumbnail?.file_id || sticker.thumb?.file_id || sticker.file_id}`);
          let coverJson: any = await coverFile.json();
          let coverUrl = `https://api.telegram.org/file/bot${botToken}/${coverJson.result.file_path}`;

          let buffer = await downloadBuffer(coverUrl);
          let fileType = await fileTypeFromBuffer(buffer);

          if (fileType?.mime === "image/webp") {
            coverBuffer = buffer;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!coverBuffer) {
        let firstSticker = json.result.stickers[0];
        let coverFile = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${firstSticker.thumbnail?.file_id || firstSticker.thumb?.file_id || firstSticker.file_id}`);
        let coverJson: any = await coverFile.json();
        let coverUrl = `https://api.telegram.org/file/bot${botToken}/${coverJson.result.file_path}`;
        coverBuffer = await downloadBuffer(coverUrl);
      }

      let coverWebp: Buffer;
      let coverFileType = await fileTypeFromBuffer(coverBuffer);

      if (coverFileType?.mime === "image/webp") {
        let metadata = await sharp(coverBuffer, { animated: true }).metadata().catch(() => sharp(coverBuffer).metadata());
        if ((metadata.pages || 1) > 1) {
          coverWebp = await sharp(coverBuffer, { page: 0 })
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 35 })
            .toBuffer();
        } else {
          coverWebp = coverBuffer;
        }
      } else {
        coverWebp = await imageToWebp({ data: coverBuffer, mimetype: coverFileType?.mime });
      }

      if (coverWebp.length > MAX_SIZE) {
        coverWebp = await compressWebP(coverWebp, false);
      }

      let allStickers: any = [];
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < json.result.stickers.length; i++) {
        try {
          let stickerData = json.result.stickers[i];
          let fileId = stickerData.file_id;

          if (stickerData.is_animated) {
            failedCount++;
            continue;
          }

          let fetchStickerId = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
          let stickerRJson: any = await fetchStickerId.json();

          if (stickerRJson.ok) {
            let fileUrl = `https://api.telegram.org/file/bot${botToken}/${stickerRJson.result.file_path}`;
            let stickerBuffer = await downloadBuffer(fileUrl);
            let fileType = await fileTypeFromBuffer(stickerBuffer);

            let processedBuffer: Buffer;

            if (fileType?.mime === "video/webm") {
              processedBuffer = await videoToWebpCompressed(stickerBuffer);
            } else if (fileType?.mime === "image/webp") {
              let metadata = await sharp(stickerBuffer, { animated: true }).metadata().catch(() => sharp(stickerBuffer).metadata());
              let isAnimated = (metadata.pages || 1) > 1;

              processedBuffer = stickerBuffer;

              if (processedBuffer.length > MAX_SIZE) {
                processedBuffer = await compressWebP(processedBuffer, isAnimated);
              }
            } else {
              processedBuffer = await imageToWebp({
                data: stickerBuffer,
                mimetype: fileType?.mime
              });

              if (processedBuffer.length > MAX_SIZE) {
                processedBuffer = await compressWebP(processedBuffer, false);
              }
            }

            if (processedBuffer.length > MAX_SIZE) {
              failedCount++;
              continue;
            }

            allStickers.push({ data: processedBuffer });
            successCount++;
          } else {
            failedCount++;
          }
        } catch (e: any) {
          failedCount++;
        }
      }

      if (allStickers.length === 0) {
        throw `❌ No stickers were successfully processed`;
      }

      const stickerPacks: any[][] = [];
      for (let i = 0; i < allStickers.length; i += MAX_STICKERS_PER_PACK) {
        stickerPacks.push(allStickers.slice(i, i + MAX_STICKERS_PER_PACK));
      }

      for (let i = 0; i < stickerPacks.length; i++) {
        const packTitle = stickerPacks.length > 1 
          ? `${json.result.title || packName} (Part ${i + 1}/${stickerPacks.length})`
          : json.result.title || packName;

        await conn!!.sendMessage(m.chat, {
          stickerPack: {
            name: packTitle,
            publisher: "Yuki Botz",
            cover: coverWebp,
            stickers: stickerPacks[i],
            packId: String(Date.now() + i),
            description: `Sticker pack from Telegram: ${packName}`
          }
        });

        if (i < stickerPacks.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      const packInfo = stickerPacks.length > 1 
        ? `\n*Split into:* ${stickerPacks.length} packs`
        : '';

      m.reply(`✅ *Finished!*
*Succeed:* ${successCount} sticker${packInfo}
*Fail:* ${failedCount} sticker`)

      m.react("✅");

    } catch (e: any) {
      console.error("Process error:", e);
      m.react("❌");
      throw `❌ Failed to process sticker pack: ${e.message}`;
    } finally {
      delete conn!!.stickerTeleProcessing[m.sender];
    }
  }
}

export default handler;