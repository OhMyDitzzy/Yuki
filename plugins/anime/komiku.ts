import type { PluginHandler } from "@yuki/types";
import { getSlugFromUrl, Komiku, type ApiResponse, type SearchResult, type MangaDetail, type LatestManga, type ChapterRead } from "plugins/anime/komiku_utils"
import type { CarouselCard } from "types/buttons/interactive_message_button";
import { jsPDF } from "jspdf";
import axios from "axios";
import sizeOf from "image-size";

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
                  text: "Baca chapter terbaru",
                  id: `${usedPrefix + command} fetchComic ${res.latestChapter?.slug || ""}`
                },
                {
                  type: "buttons",
                  text: "Daftar chapter",
                  id: `${usedPrefix + command} getDetail ${getSlugFromUrl(res.mangaUrl)}`
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
          const chapterRows = currentChapters.map((ch, idx) => ({
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

          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [210, 297],
            compress: true
          });

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
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(data.images.length / BATCH_SIZE);
                        
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
                    const isLandscape = imgWidth > imgHeight;

                    if (!isFirstPage) {
                      pdf.addPage(
                        [210, 297],
                        isLandscape ? 'landscape' : 'portrait'
                      );
                    }
                    isFirstPage = false;

                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();

                    const imgRatio = imgWidth / imgHeight;
                    const pageRatio = pageWidth / pageHeight;
                    
                    let finalWidth, finalHeight, offsetX = 0, offsetY = 0;
                    
                    if (imgRatio > pageRatio) {
                      finalWidth = pageWidth;
                      finalHeight = pageWidth / imgRatio;
                      offsetY = (pageHeight - finalHeight) / 2;
                    } else {
                      finalHeight = pageHeight;
                      finalWidth = pageHeight * imgRatio;
                      offsetX = (pageWidth - finalWidth) / 2;
                    }

                    pdf.addImage(
                      `data:image/${imageType.toLowerCase()};base64,${imageData}`,
                      imageType,
                      offsetX,
                      offsetY,
                      finalWidth,
                      finalHeight,
                      undefined,
                      'FAST'
                    );

                    pdf.setFontSize(10);
                    pdf.text(
                      `Halaman ${img.index}`, 
                      pageWidth / 2, 
                      pageHeight - 5, 
                      { align: 'center' }
                    );

                    successCount++;
                  } catch (err: any) {
                    console.error(`[${img.index}] Error adding to PDF:`, err.message);
                    failedImages.push(img.index);
                  }
                } else {
                  failedImages.push(img.index);
                  if (!isFirstPage) pdf.addPage();
                  isFirstPage = false;
                  pdf.setFontSize(12);
                  pdf.text(
                    `Halaman ${img.index} gagal dimuat`,
                    pdf.internal.pageSize.getWidth() / 2,
                    pdf.internal.pageSize.getHeight() / 2,
                    { align: 'center' }
                  );
                }
              } else {
                console.error(`Batch result rejected:`, result.reason);
              }
            }

            const currentProgress = Math.min(i + BATCH_SIZE, data.images.length);
            const percentage = ((currentProgress / data.images.length) * 100).toFixed(1);
            
            if (i + BATCH_SIZE < data.images.length) {
              await delay(DELAY_BETWEEN_BATCHES);
            }
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
        }
        break;
      }

      case "getLatestManga": {
        m.react("⏳")
        try {
          const latest = await komiku.getLatestPopularManga();
          
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
                  text: "Baca Sekarang",
                  id: `${usedPrefix + command} fetchComic ${getSlugFromUrl(manga.chapterUrl)}`
                },
                {
                  type: "buttons",
                  text: "Lihat Detail",
                  id: `${usedPrefix + command} getDetail ${manga.slug}`
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
          const latest = await komiku.getLatestPopularManhwa();
          
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
                  text: "Baca Sekarang",
                  id: `${usedPrefix + command} fetchComic ${getSlugFromUrl(manga.chapterUrl)}`
                },
                {
                  type: "buttons",
                  text: "Lihat Detail",
                  id: `${usedPrefix + command} getDetail ${manga.slug}`
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
          const latest = await komiku.getLatestPopularManhua();
          
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
                  text: "Baca Sekarang",
                  id: `${usedPrefix + command} fetchComic ${getSlugFromUrl(manga.chapterUrl)}`
                },
                {
                  type: "buttons",
                  text: "Lihat Detail",
                  id: `${usedPrefix + command} getDetail ${manga.slug}`
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
        return m.reply(`Perintah dengan *${subCommand}* tidak terdaftar di ${command}\n\nPerintah yang tersedia:\n• search <judul>\n• getDetail <slug> [page]\n• fetchComic <chapter_slug>\n• getLatestManga\n• getLatestManhwa\n• getLatestManhua`)
      }
    }
  }
}

export default handler;