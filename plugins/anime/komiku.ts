import type { PluginHandler } from "@yuki/types";
import { getSlugFromUrl, Komiku, type ApiResponse, type SearchResult } from "plugins/anime/komiku_utils"
import type { CarouselCard } from "types/buttons/interactive_message_button";
import { jsPDF } from "jspdf";
import axios from "axios";
import sizeOf from "image-size";
import { WebSocket } from "ws";
import { createHash } from "crypto";

const WS_URL = process.env.WS_URL || "wss://ditzzy-yuki.hf.space/ws";
let botWs: WebSocket | null = null;

const activeStreamSessions = new Map<string, Set<string>>();

function initBotWebSocket() {
  if (botWs?.readyState === WebSocket.OPEN) return;

  botWs = new WebSocket(WS_URL);

  botWs.on("open", () => {
    console.log("[Comic Bot WebSocket] Connected to web server");
    botWs?.send(JSON.stringify({ type: "bot_connect" }));
  });

  botWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleBotWebMessage(message);
    } catch (error) {
      console.error("[Comic Bot WebSocket] Error parsing message:", error);
    }
  });

  botWs.on("close", () => {
    console.log("[Comic Bot WebSocket] Disconnected, reconnecting in 5s...");
    botWs = null;
    setTimeout(initBotWebSocket, 5000);
  });

  botWs.on("error", (error) => {
    console.error("[Comic Bot WebSocket] Error:", error);
  });
}

async function handleBotWebMessage(message: any) {
  const { type } = message;

  switch (type) {
    case 'fetch_chapter_request': {
      const { sessionId, chapterSlug, sender, allChapters } = message;
      console.log(`[Bot] Fetching chapter: ${chapterSlug} for session: ${sessionId}`);

      try {
        const komiku = new Komiku();
        const chapter = await komiku.readChapter(chapterSlug, allChapters);

        if (!chapter || !chapter.results) {
          throw new Error('Chapter not found');
        }

        const data = chapter.results;

        const chapterData = {
          slug: chapterSlug,
          title: data.title,
          images: data.images,
          totalImages: data.totalImages,
          prevChapter: data.prevChapter,
          nextChapter: data.nextChapter,
          allChapters: data.allChapters || allChapters || []
        };

        console.log('[Bot] Chapter data prepared:', {
          slug: chapterData.slug,
          title: chapterData.title,
          hasPrev: !!chapterData.prevChapter,
          hasNext: !!chapterData.nextChapter,
          prevSlug: chapterData.prevChapter?.slug,
          nextSlug: chapterData.nextChapter?.slug
        });

        if (botWs?.readyState === WebSocket.OPEN) {
          botWs.send(JSON.stringify({
            type: 'chapter_fetched',
            sessionId,
            success: true,
            chapterData
          }));
          console.log(`[Bot] Chapter data sent for session: ${sessionId}`);
        }
      } catch (error: any) {
        console.error('[Bot] Error fetching chapter:', error);
        if (botWs?.readyState === WebSocket.OPEN) {
          botWs.send(JSON.stringify({
            type: 'chapter_fetched',
            sessionId,
            success: false,
            error: error.message || 'Failed to fetch chapter'
          }));
        }
      }
      break;
    }
    case 'session_cleanup': {
      const { sessionId, sender } = message;
      if (sender && activeStreamSessions.has(sender)) {
        const userSessions = activeStreamSessions.get(sender)!;
        userSessions.delete(sessionId);
        if (userSessions.size === 0) {
          activeStreamSessions.delete(sender);
        }
        console.log(`[Bot] Session ${sessionId} removed for ${sender}`);
      }
      break;
    }
    
    case 'cleanup_confirmed': {
      const { sessionId, sender } = message;
      console.log(`[Bot] Cleanup confirmed for session: ${sessionId}`);
      break;
    }

    default:
      break;
  }
}

function timeAgo(ms: number) {
  const now = Date.now();
  const diff = now - ms;

  const diffMs = ms < 10000000000 ? now - (ms * 1000) : diff;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} tahun yang lalu`;
  if (months > 0) return `${months} bulan yang lalu`;
  if (weeks > 0) return `${weeks} minggu yang lalu`;
  if (days > 0) return `${days} hari yang lalu`;
  if (hours > 0) return `${hours} jam yang lalu`;
  if (minutes > 0) return `${minutes} menit yang lalu`;
  return `${seconds} detik yang lalu`;
}

let handler: PluginHandler = {
  name: "Komiku",
  description: "Get information and read your favorite manga/manhwa/manhua",
  register: true,
  limit: 5,
  tags: ["anime"],
  cmd: ["komiku"],
  exec: async (m, { conn, text, usedPrefix, command, args }) => {
    let subCommand = args[0]
    let user = global.db.data.users[m.sender]
    let query = args.slice(1).join(" ")

    if (!text) return conn.sendMessage(m.chat, {
      text: `Hallo ${user.name || m.name}!\n\nApa yang ingin kamu baca hari ini? Ketik:\n_${usedPrefix + command} search <judul>_ Untuk mencari manga/manhwa/manhua favorit mu.`,
      footer: "Atau klik tombol di bawah ini untuk mendapatkan informasi manga/manhwa/manhua terbaru dan populer",
      buttons: [{
        buttonId: `${usedPrefix + command} getLatestManga`,
        buttonText: {
          displayText: "🇯🇵 Manga"
        },
        type: 1
      }, {
        buttonId: `${usedPrefix + command} getLatestManhwa`,
        buttonText: {
          displayText: "🇰🇷 Manhwa"
        },
        type: 1
      }, {
        buttonId: `${usedPrefix + command} getLatestManhua`,
        buttonText: {
          displayText: "🇨🇳 Manhua"
        },
        type: 1
      }],
      headerType: 1,
      viewOnce: true
    }, { quoted: m })

    const komiku = new Komiku();

    switch (subCommand) {
      case 'reset': {
        if (!global.db.data.users[m.sender]?.moderator) {
          return m.reply("⚠️ *Akses Ditolak*\n\nPerintah ini hanya bisa digunakan oleh owner!");
        }
        let targetJid: string | undefined;
        
        if (m.quoted) {
          targetJid = m.quoted.sender;
        } else if (m.mentionedJid?.length) {
          targetJid = m.mentionedJid[0];
        } else if (query) {
          targetJid = query.includes('@') ? query : `${query}@s.whatsapp.net`;
        }
        
        const jid = await conn.getJid(targetJid);

        if (!jid) {
          return m.reply(`⚠️ *Format salah!*

Gunakan salah satu format berikut:
• Tag user: _${usedPrefix + command} reset @user_
• Reply pesan user: _reply message + ${usedPrefix + command} reset_
• Masukkan nomor: _${usedPrefix + command} reset 628123456789_`);
        }
        
        if (!jid.includes('@')) {
          targetJid = `${targetJid}@s.whatsapp.net`;
        }
        
        const userSessions = activeStreamSessions.get(targetJid);
        
        if (!userSessions || userSessions.size === 0) {
          return m.reply(`ℹ️ *User tidak memiliki stream aktif*

User: ${jid.split('@')[0]}
Stream aktif: 0`);
        }

        const sessionCount = userSessions.size;
        const sessions = Array.from(userSessions);

        m.react("⏳");
        
        if (botWs?.readyState === WebSocket.OPEN) {
          for (const sessionId of sessions) {
            botWs.send(JSON.stringify({
              type: 'force_cleanup_session',
              sessionId,
              sender: jid,
              reason: 'Owner reset'
            }));
          }
        }

        activeStreamSessions.delete(targetJid);

        m.react("✅");
        return m.reply(`✅ *Reset Stream Berhasil*

User: ${jid.split('@')[0]}
Stream dihapus: ${sessionCount}
Status: Semua session telah direset

User sekarang bisa membuat stream baru.`);
      }
      
      case 'stream': {
        if (!query) return m.reply(`Masukan slug manga! Contoh: ${usedPrefix + command} stream solo-leveling-id`);

        if (!user.password) {
          return m.reply(`⚠️ *Password Belum Diatur*

Untuk menggunakan fitur stream comic, kamu harus set password terlebih dahulu.

Ketik: _${usedPrefix}setpassword <password_kamu>_`);
        }

        if (!user.premium) {
          const userSessions = activeStreamSessions.get(m.sender);
          const activeCount = userSessions?.size || 0;

          if (activeCount >= 2) {
            return m.reply(`⚠️ *Limit Stream Tercapai*

Kamu sudah memiliki *${activeCount} stream aktif*.

User non-premium hanya bisa memiliki maksimal *2 stream aktif* secara bersamaan.

*Solusi:*
• Tunggu hingga stream lama expired (24 jam)
• Upgrade ke premium: _${usedPrefix}premium_
• Hubungi owner untuk hapus session: _${usedPrefix}owner_`);
          }
        }

        if (!botWs || botWs.readyState !== WebSocket.OPEN) {
          initBotWebSocket();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (botWs?.readyState !== WebSocket.OPEN) {
          return m.reply("⚠️ Koneksi ke web server gagal. Coba lagi nanti.");
        }

        m.react("⏳");
        try {
          const detail = await komiku.getDetail(query);

          if (!detail || !detail.results) {
            m.react("❌");
            return m.reply("Detail manga tidak ditemukan!");
          }

          const data = detail.results;
          const sessionHash = createHash("md5")
            .update(`comic_${m.sender}_${Date.now()}`)
            .digest("hex");
            
          if (!activeStreamSessions.has(m.sender)) {
            activeStreamSessions.set(m.sender, new Set());
          }
          activeStreamSessions.get(m.sender)!.add(sessionHash);

          const comicData = {
            type: 'comic_stream',
            sessionId: sessionHash,
            sender: m.sender,
            password: user.password,
            data: {
              slug: query,
              title: data.title,
              indonesiaTitle: data.indonesia_title,
              type: data.type,
              author: data.author,
              status: data.status,
              genre: data.genre || [],
              synopsis: data.synopsis,
              thumbnailUrl: data.thumbnailUrl,
              chapters: data.chapters?.map(ch => ({
                slug: ch.slug_chapter,
                chapter: ch.chapter,
                date: ch.date,
                views: ch.views
              })) || []
            }
          };

          botWs.send(JSON.stringify(comicData));

          const webUrl = process.env.WEB_URL || 'https://ditzzy-yuki.hf.space';
          const streamLink = `${webUrl}/comic/${sessionHash}`;

          const activeCount = activeStreamSessions.get(m.sender)!.size;
          const statusText = user.premium 
            ? "• *Status:* Premium (Unlimited)" 
            : `• *Status:* Free (${activeCount}/2 stream aktif)`;

          const caption = `✅ *Stream Comic Berhasil Dibuat!*

• *${data.title}*
• *Total Chapter:* ${data.chapters?.length || 0}
${statusText}
• *NOTE:* Link aktif selama *24 jam*

Click tombol di bawah untuk mulai baca! 👇`;

          await conn.sendButtonV2(
            m.chat,
            {
              body: { text: caption },
              footer: { text: "Jangan share link ini ke orang lain!" },
            },
            [
              {
                type: "url",
                text: "🌐 Buka di Web",
                url: streamLink,
              }
            ],
            { quoted: m } as any
          );

          m.react("✅");
        } catch (e) {
          m.react("❌");
          m.reply("Yahh kayak nya ada yang error nih");
          conn.error(m, e);
        }
        break;
      }
      case "search": {
        if (!query) return m.reply(`Masukan judul! Contoh: ${usedPrefix + command} search solo leveling`)

        m.react("⏳")
        try {
          const search: ApiResponse<SearchResult[]> = await komiku.search(query)! as ApiResponse<SearchResult[]>;
          let cards: CarouselCard[] = [];

          for (const res of search.results) {
            if (!res.detail || !res.detail.results) continue;

            const detail = res.detail.results;

            const synopsis = detail.synopsis
              ? (detail.synopsis.length > 400
                ? detail.synopsis.substring(0, 400) + "..."
                : detail.synopsis)
              : "Sinopsis tidak tersedia";

            const genreText = detail.genre && detail.genre.length > 0
              ? detail.genre.join(", ")
              : "Tidak diketahui";

            const totalChapters = detail.chapters?.length || 0;

            const capt = `• *Judul:* ${res.title}
• *Type:* ${res.type || "Tidak diketahui"}
• *Genre:* ${genreText}
• *Author:* ${detail.author || "Tidak diketahui"}
• *Total Chapter:* ${totalChapters} ${totalChapters > 0 ? "_(Data mungkin termasuk chapter perbaikan)_" : ""}
• *Chapter terbaru:* ${res.latestChapter?.title || "Tidak diketahui"}

${synopsis}
`
            cards.push({
              header: "*Results*",
              body: capt,
              footer: `Terakhir di update: ${timeAgo(res.lastUpdateMs)}`,
              image: detail.thumbnailUrl || res.thumbnailUrl,
              buttons: [
                {
                  type: "buttons",
                  text: "📖 Baca Chapter Terbaru",
                  id: `${usedPrefix + command} fetchComic ${res.latestChapter?.slug || ""}`
                },
                {
                  type: "buttons",
                  text: "📚 Daftar Chapter",
                  id: `${usedPrefix + command} getDetail ${getSlugFromUrl(res.mangaUrl)}`
                },
                {
                  type: "buttons",
                  text: "🌐 Stream di Web",
                  id: `${usedPrefix + command} stream ${getSlugFromUrl(res.mangaUrl)}`
                }
              ]
            })
          }

          if (cards.length === 0) {
            m.react("❌");
            return m.reply(`Tidak ditemukan hasil untuk: ${query}`);
          }

          let captions = `Hallo Kak ${user.name || m.name}!

Ini hasil pencarian mu dengan keyword:
${query}
`;
          await conn.sendCarousel(m.chat, {
            body: {
              text: captions
            },
            footer: {
              text: "Semoga kamu suka!"
            }
          }, cards, { quoted: m } as any)

          m.react("✅");
        } catch (e) {
          m.react("❌");
          m.reply("Yahh kayak nya ada yang error nih");
          conn.error(m, e)
        }
        break;
      }

      case "getDetail": {
        const parts = query.split(" ");
        const slug = parts[0];
        const page = parseInt(parts[1]) || 1;

        if (!slug) return m.reply(`Masukan slug manga! Contoh: ${usedPrefix + command} getDetail solo-leveling`)

        m.react("⏳")
        try {
          const detail = await komiku.getDetail(slug);

          if (!detail || !detail.results) {
            m.react("❌");
            return m.reply("Detail manga tidak ditemukan!");
          }

          const data = detail.results;
          const genreText = data.genre && data.genre.length > 0
            ? data.genre.join(", ")
            : "Tidak diketahui";

          const totalChapters = data.chapters?.length || 0;
          const chaptersPerPage = 100;
          const totalPages = Math.ceil(totalChapters / chaptersPerPage);
          const startIdx = (page - 1) * chaptersPerPage;
          const endIdx = Math.min(startIdx + chaptersPerPage, totalChapters);
          const currentChapters = data.chapters?.slice(startIdx, endIdx) || [];

          let headerText = `📖 *Detail Komik*

• *Judul:* ${data.title || "Tidak diketahui"}
• *Judul Indonesia:* ${data.indonesia_title || "Tidak diketahui"}
• *Type:* ${data.type || "Tidak diketahui"}
• *Author:* ${data.author || "Tidak diketahui"}
• *Status:* ${data.status || "Tidak diketahui"}
• *Genre:* ${genreText}
• *Total Chapter:* ${totalChapters}

${data.synopsis || "Sinopsis tidak tersedia"}
`;

          const sections = [];
          const chapterRows = currentChapters.map((ch, _) => ({
            title: `${ch.chapter}`,
            description: `${ch.date} • ${ch.views}`,
            id: `${usedPrefix + command} fetchComic ${ch.slug_chapter}`
          }));

          sections.push({
            title: `📚 Chapter ${startIdx + 1} - ${endIdx}`,
            rows: chapterRows
          });

          if (totalPages > 1) {
            const navRows = [];

            if (page > 1) {
              navRows.push({
                title: "⬅️ Halaman Sebelumnya",
                description: `Lihat chapter halaman ${page - 1}`,
                id: `${usedPrefix + command} getDetail ${slug} ${page - 1}`
              });
            }

            if (page < totalPages) {
              navRows.push({
                title: "➡️ Halaman Selanjutnya",
                description: `Lihat chapter halaman ${page + 1}`,
                id: `${usedPrefix + command} getDetail ${slug} ${page + 1}`
              });
            }

            sections.push({
              title: "🔄 Navigasi",
              rows: navRows
            });
          }
          
          sections.push({
            title: "⚡ Quick Actions",
            rows: [
              {
                title: "🌐 Baca di Web (Stream)",
                description: "Baca semua chapter di web browser",
                id: `${usedPrefix + command} stream ${slug}`
              }
            ]
          });

          await conn.sendMessage(m.chat, {
            image: { url: data.thumbnailUrl },
            caption: headerText
          }, { quoted: m });

          await conn?.sendListV2(m.chat, {
            body: {
              text: `Pilih chapter yang ingin kamu baca dari list di bawah ini:`
            },
            footer: {
              text: `Total ${totalChapters} chapter tersedia`
            },
          }, {
            title: "📖 Daftar Chapter",
            sections: sections
          }, { quoted: m } as any);

          m.react("✅");
        } catch (e) {
          m.react("❌");
          m.reply("Yahh kayak nya ada yang error nih");
          conn.error(m, e)
        }
        break;
      }

      case "fetchComic": {
        if (!query) return m.reply(`Masukan slug chapter! Contoh: ${usedPrefix + command} fetchComic solo-leveling-chapter-1`)

        conn.fetchComic = conn.fetchComic || {};
        if (conn!!.fetchComic[m.sender]) {
          return m.reply(`⚠️ *Your request is already processing!*\n\nPlease wait until your current request is completed.`);
        }

        if (Object.keys(conn!!.fetchComic).length > 0) {
          return m.reply("⚠️ *Another user is currently processing a comic, please wait until the process is complete!*");
        }

        conn.fetchComic[m.sender] = {
          query,
          startTime: Date.now(),
          chatId: m.chat
        }

        m.react("⏳")
        try {
          const chapter = await komiku.readChapter(query);

          if (!chapter || !chapter.results) {
            m.react("❌");
            return m.reply("Chapter tidak ditemukan!");
          }

          const data = chapter.results;

          await m.reply(`📖 *Membuat PDF*

• *Judul:* ${data.title || "Tidak diketahui"}
• *Total Halaman:* ${data.totalImages || 0}

Mohon tunggu, sedang mengunduh dan membuat PDF...`);

          let pdf: jsPDF | null = null;
          let isFirstPage = true;
          let successCount = 0;
          let failedImages: number[] = [];
          const BATCH_SIZE = 3;
          const DELAY_BETWEEN_BATCHES = 1000;
          const ABSOLUTE_TIMEOUT = 60000;

          const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

          const withAbsoluteTimeout = <T>(promise: Promise<T>, timeoutMs: number, index: number): Promise<T> => {
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                reject(new Error(`[${index}] Absolute timeout after ${timeoutMs}ms`));
              }, timeoutMs);

              promise
                .then((result) => {
                  clearTimeout(timer);
                  resolve(result);
                })
                .catch((err) => {
                  clearTimeout(timer);
                  reject(err);
                });
            });
          };

          const downloadImageWithRetry = async (imageUrl: string, index: number, maxRetries = 2) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              const controller = new AbortController();
              const abortTimeout = setTimeout(() => controller.abort(), 30000);

              try {
                const downloadPromise = axios.get(imageUrl, {
                  responseType: 'arraybuffer',
                  signal: controller.signal,
                  maxContentLength: 10 * 1024 * 1024,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': 'https://komiku.id/',
                    'Connection': 'keep-alive'
                  },
                  validateStatus: (status) => status === 200
                });

                const response = await withAbsoluteTimeout(downloadPromise, ABSOLUTE_TIMEOUT, index);

                clearTimeout(abortTimeout);
                return response;

              } catch (err: any) {
                clearTimeout(abortTimeout);

                if (axios.isCancel(err) || err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                  console.error(`[${index}] ⏱️ Timeout on attempt ${attempt}`);
                } else {
                  console.error(`[${index}] ❌ Error on attempt ${attempt}:`, err.message);
                }

                if (attempt === maxRetries) {
                  throw new Error(`Failed after ${maxRetries} attempts: ${err.message}`);
                }

                await delay(1500 * attempt);
              }
            }
            throw new Error('Should not reach here');
          };

          for (let i = 0; i < data.images.length; i += BATCH_SIZE) {
            const batch = data.images.slice(i, Math.min(i + BATCH_SIZE, data.images.length));
            const batchPromises = batch.map(async (img) => {
              try {
                const response = await downloadImageWithRetry(img.imageUrl, img.index);
                return { img, response, success: true, error: null };
              } catch (err: any) {
                console.error(`[${img.index}] ❌ Final failure:`, err.message);
                return { img, response: null, success: false, error: err.message };
              }
            });

            const batchResults = await Promise.allSettled(batchPromises);
            for (const result of batchResults) {
              if (result.status === 'fulfilled') {
                const { img, response, success } = result.value;

                if (success && response) {
                  try {
                    const imageBuffer = Buffer.from(response.data);
                    const imageData = imageBuffer.toString('base64');
                    const imageType = response.headers['content-type']?.includes('png') ? 'PNG' : 'JPEG';
                    const dimensions = sizeOf(imageBuffer);
                    const imgWidth = dimensions.width || 800;
                    const imgHeight = dimensions.height || 1200;
                    const widthMM = (imgWidth * 25.4) / 96;
                    const heightMM = (imgHeight * 25.4) / 96;

                    if (isFirstPage) {
                      pdf = new jsPDF({
                        orientation: widthMM > heightMM ? 'landscape' : 'portrait',
                        unit: 'mm',
                        format: [widthMM, heightMM],
                        compress: true
                      });
                      isFirstPage = false;
                    } else {
                      pdf!.addPage(
                        [widthMM, heightMM],
                        widthMM > heightMM ? 'landscape' : 'portrait'
                      );
                    }

                    pdf!.addImage(
                      `data:image/${imageType.toLowerCase()};base64,${imageData}`,
                      imageType,
                      0,
                      0,
                      widthMM,
                      heightMM,
                      undefined,
                      'FAST'
                    );

                    pdf!.setFontSize(8);
                    pdf!.setTextColor(150, 150, 150);
                    pdf!.text(
                      `${img.index}`,
                      widthMM - 10,
                      heightMM - 5,
                      { align: 'right' }
                    );

                    successCount++;
                  } catch (err: any) {
                    console.error(`[${img.index}] Error adding to PDF:`, err.message);
                    failedImages.push(img.index);
                  }
                } else {
                  failedImages.push(img.index);

                  if (isFirstPage) {
                    pdf = new jsPDF({
                      orientation: 'portrait',
                      unit: 'mm',
                      format: [210, 297],
                      compress: true
                    });
                    isFirstPage = false;
                  } else {
                    pdf!.addPage();
                  }

                  pdf!.setFontSize(12);
                  pdf!.text(
                    `Halaman ${img.index} gagal dimuat`,
                    pdf!.internal.pageSize.getWidth() / 2,
                    pdf!.internal.pageSize.getHeight() / 2,
                    { align: 'center' }
                  );
                }
              } else {
                console.error(`Batch result rejected:`, result.reason);
              }
            }

            if (i + BATCH_SIZE < data.images.length) {
              await delay(DELAY_BETWEEN_BATCHES);
            }
          }

          if (!pdf) {
            throw new Error('Tidak ada gambar yang berhasil dimuat');
          }

          const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

          let caption = `✅ *Selesai!*

• *Judul:* ${data.title}
• *Total:* ${data.totalImages} halaman
• *Berhasil:* ${successCount}
• *Gagal:* ${failedImages.length}
• *Size:* ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`;

          if (failedImages.length > 0) {
            caption += `\n\n⚠️ *Halaman gagal:* ${failedImages.slice(0, 15).join(', ')}${failedImages.length > 15 ? '...' : ''}`;
          }

          caption += `\n\nSelamat membaca! 📖`;

          await conn.sendMessage(m.chat, {
            document: pdfBuffer,
            fileName: `${data.title || query}.pdf`,
            mimetype: 'application/pdf',
            caption: caption
          }, { quoted: m });

          m.react("✅");

        } catch (e) {
          m.react("❌");
          console.error('Fatal error:', e);
          m.reply("Error saat membuat PDF. Coba lagi ya!");
          conn.error(m, e)
        } finally {
          delete conn.fetchComic[m.sender];
        }
        break;
      }

      case "getLatestManga": {
        m.react("⏳")
        try {
          const latest: any = await komiku.getLatestPopularManga();

          if (!latest || !Array.isArray(latest.results) || latest.results.length === 0) {
            m.react("❌");
            return m.reply("Tidak ada manga terbaru saat ini!");
          }

          let cards: CarouselCard[] = [];

          for (const manga of latest.results.slice(0, 10)) {
            const capt = `• *Judul:* ${manga.title}
• *Genre/Views:* ${manga.genreView}
• *Chapter Terbaru:* ${manga.latestChapter}
`;
            cards.push({
              header: "*🇯🇵 Manga Terbaru*",
              body: capt,
              footer: "Klik tombol untuk baca",
              image: manga.thumbnailUrl,
              buttons: [
                {
                  type: "buttons",
                  text: "📖 Baca Sekarang",
                  id: `${usedPrefix + command} fetchComic ${getSlugFromUrl(manga.chapterUrl)}`
                },
                {
                  type: "buttons",
                  text: "📚 Lihat Detail",
                  id: `${usedPrefix + command} getDetail ${manga.slug}`
                },
                {
                  type: "buttons",
                  text: "🌐 Stream Web",
                  id: `${usedPrefix + command} stream ${manga.slug}`
                }
              ]
            })
          }

          await conn.sendCarousel(m.chat, {
            body: {
              text: `🇯🇵 *Manga Populer Terbaru*\n\nBerikut adalah ${cards.length} manga populer yang baru diupdate!`
            },
            footer: {
              text: "Selamat membaca!"
            }
          }, cards, { quoted: m } as any)

          m.react("✅");
        } catch (e) {
          m.react("❌");
          m.reply("Yahh kayak nya ada yang error nih");
          conn.error(m, e)
        }
        break;
      }
      
      case "getLatestManhwa": {
        m.react("⏳")
        try {
          const latest: any = await komiku.getLatestPopularManhwa();

          if (!latest || !Array.isArray(latest.results) || latest.results.length === 0) {
            m.react("❌");
            return m.reply("Tidak ada manhwa terbaru saat ini!");
          }

          let cards: CarouselCard[] = [];

          for (const manga of latest.results.slice(0, 10)) {
            const capt = `• *Judul:* ${manga.title}
• *Genre/Views:* ${manga.genreView}
• *Chapter Terbaru:* ${manga.latestChapter}
`;
            cards.push({
              header: "*🇰🇷 Manhwa Terbaru*",
              body: capt,
              footer: "Klik tombol untuk baca",
              image: manga.thumbnailUrl,
              buttons: [
                {
                  type: "buttons",
                  text: "📖 Baca Sekarang",
                  id: `${usedPrefix + command} fetchComic ${getSlugFromUrl(manga.chapterUrl)}`
                },
                {
                  type: "buttons",
                  text: "📚 Lihat Detail",
                  id: `${usedPrefix + command} getDetail ${manga.slug}`
                },
                {
                  type: "buttons",
                  text: "🌐 Stream Web",
                  id: `${usedPrefix + command} stream ${manga.slug}`
                }
              ]
            })
          }

          await conn.sendCarousel(m.chat, {
            body: {
              text: `🇰🇷 *Manhwa Populer Terbaru*\n\nBerikut adalah ${cards.length} manhwa populer yang baru diupdate!`
            },
            footer: {
              text: "Selamat membaca!"
            }
          }, cards, { quoted: m } as any)

          m.react("✅");
        } catch (e) {
          m.react("❌");
          m.reply("Yahh kayak nya ada yang error nih");
          conn.error(m, e)
        }
        break;
      }

      case "getLatestManhua": {
        m.react("⏳")
        try {
          const latest: any = await komiku.getLatestPopularManhua();

          if (!latest || !Array.isArray(latest.results) || latest.results.length === 0) {
            m.react("❌");
            return m.reply("Tidak ada manhua terbaru saat ini!");
          }

          let cards: CarouselCard[] = [];

          for (const manga of latest.results.slice(0, 10)) {
            const capt = `• *Judul:* ${manga.title}
• *Genre/Views:* ${manga.genreView}
• *Chapter Terbaru:* ${manga.latestChapter}
`;
            cards.push({
              header: "*🇨🇳 Manhua Terbaru*",
              body: capt,
              footer: "Klik tombol untuk baca",
              image: manga.thumbnailUrl,
              buttons: [
                {
                  type: "buttons",
                  text: "📖 Baca Sekarang",
                  id: `${usedPrefix + command} fetchComic ${getSlugFromUrl(manga.chapterUrl)}`
                },
                {
                  type: "buttons",
                  text: "📚 Lihat Detail",
                  id: `${usedPrefix + command} getDetail ${manga.slug}`
                },
                {
                  type: "buttons",
                  text: "🌐 Stream Web",
                  id: `${usedPrefix + command} stream ${manga.slug}`
                }
              ]
            })
          }

          await conn.sendCarousel(m.chat, {
            body: {
              text: `🇨🇳 *Manhua Populer Terbaru*\n\nBerikut adalah ${cards.length} manhua populer yang baru diupdate!`
            },
            footer: {
              text: "Selamat membaca!"
            }
          }, cards, { quoted: m } as any)

          m.react("✅");
        } catch (e) {
          m.react("❌");
          m.reply("Yahh kayak nya ada yang error nih");
          conn.error(m, e)
        }
        break;
      }

      default: {
        return m.reply(`Perintah dengan *${subCommand}* tidak terdaftar di ${command}\n\nPerintah yang tersedia:\n• search <judul>\n• stream <slug>\n• getDetail <slug> [page]\n• fetchComic <chapter_slug>\n• getLatestManga\n• getLatestManhwa\n• getLatestManhua`)
      }
    }
  }
}

export default handler;