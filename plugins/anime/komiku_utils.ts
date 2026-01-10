import axios from "axios";
import * as cheerio from "cheerio";

export interface ChapterInfo {
  chapter: string;
  slug_chapter: string;
  views: string;
  date: string;
}

export interface MangaDetail {
  title?: string;
  indonesia_title?: string;
  type?: string;
  author?: string;
  status?: string;
  thumbnailUrl: string;
  synopsis: string;
  genre: string[];
  chapters: ChapterInfo[];
}

export interface SearchChapterInfo {
  title: string;
  url: string;
  slug: string;
}

export interface SearchResult {
  title: string;
  mangaUrl: string;
  thumbnailUrl: string;
  type: string;
  genre: string;
  lastUpdateMs: number;
  firstChapter: SearchChapterInfo | null;
  latestChapter: SearchChapterInfo | null;
  detail: ApiResponse<MangaDetail | null> | null;
}

export interface ChapterImage {
  index: number;
  imageUrl: string;
}

export interface ChapterRead {
  title: string;
  chapterNumber: string;
  seriesTitle: string;
  seriesUrl: string;
  totalImages: number;
  images: ChapterImage[];
  prevChapterUrl: string | null;
  nextChapterUrl: string | null;
}

export interface LatestManga {
  title: string;
  mangaUrl: string;
  thumbnailUrl: string;
  genreView: string;
  slug: string;
  latestChapter: string;
  chapterUrl: string;
}

export interface ApiResponse<T> {
  created_by: string;
  note: string;
  results: T;
}

type KeyMapType = {
  [key: string]: keyof Pick<MangaDetail, 'title' | 'indonesia_title' | 'type' | 'author' | 'status'>;
};

export function getSlugFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch (error) {
    try {
      const parts = url.split("/").filter(Boolean);
      return parts[parts.length - 1] || '';
    } catch {
      return '';
    }
  }
}

function parseUpdateToMs(updateText: string): number {
  const now = Date.now();

  const match = updateText.match(/(\d+)\s*(detik|menit|jam|hari|minggu|bulan|tahun)/i);

  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const msPerUnit: Record<string, number> = {
    'detik': 1000,
    'menit': 60 * 1000,
    'jam': 60 * 60 * 1000,
    'hari': 24 * 60 * 60 * 1000,
    'minggu': 7 * 24 * 60 * 60 * 1000,
    'bulan': 30 * 24 * 60 * 60 * 1000,
    'tahun': 365 * 24 * 60 * 60 * 1000
  };

  const ms = msPerUnit[unit] || 0;
  return now - (value * ms);
}

function resizeThumbnail(url: string, width: number = 540, height: number = 350): string {
  if (!url) return url;

  if (url.includes('?resize=')) {
    return url.replace(/\?resize=\d+,\d+/, `?resize=${width},${height}`);
  }

  // If no resize parameter exists, return as is
  return url;
}

export class Komiku {
  private BASE_URL: string;
  private API_URL: string;
  private CREATED_BY: string;
  private NOTE: string;

  constructor() {
    this.BASE_URL = "https://komiku.org";
    this.API_URL = "https://api.komiku.org";
    this.CREATED_BY = "Ditzzy";
    this.NOTE = "Thank you for using this scrape, I hope you appreciate me for making this scrape by not deleting wm";
  }

  private wrapResponse<T>(data: T): ApiResponse<T> {
    return {
      created_by: this.CREATED_BY,
      note: this.NOTE,
      results: data
    };
  }

  async search(query: string, postType: string = "manga"): Promise<ApiResponse<SearchResult[]> | []> {
    try {
      const { data } = await axios.get<string>(`${this.API_URL}/?post_type=${postType}&s=${encodeURIComponent(query)}`);
      const $ = cheerio.load(data);

      const results: SearchResult[] = [];
      const $containers = $('div.bge');

      for (let index = 0; index < $containers.length; index++) {
        const el = $containers[index];

        try {
          let thumbnailUrl = '';
          const imgElement = $(el).find('img').first();
          if (imgElement.length > 0) {
            thumbnailUrl = imgElement.attr('src') || imgElement.attr('data-src') || '';
            thumbnailUrl = resizeThumbnail(thumbnailUrl);
          }

          let type = '';
          let genre = '';
          const typeGenreElement = $(el).find('div.tpe1_inf, .tpe1_inf');
          if (typeGenreElement.length > 0) {
            const text = typeGenreElement.text().trim();
            const parts = text.split(/\s+/);
            if (parts.length > 0) {
              type = parts[0].replace(/<\/?b>/g, '').trim();
              genre = parts.slice(1).join(' ').trim();
            }
          }

          let title = '';
          let mangaUrl = '';

          const h3Element = $(el).find('h3').first();
          if (h3Element.length > 0) {
            title = h3Element.text().trim();

            const parentLink = h3Element.parent('a');
            if (parentLink.length > 0) {
              mangaUrl = parentLink.attr('href') || '';
            } else {
              const nearbyLink = h3Element.closest('div').find('a[href*="/manga/"]').first();
              if (nearbyLink.length > 0) {
                mangaUrl = nearbyLink.attr('href') || '';
              }
            }
          }

          if (!title || !mangaUrl) {
            $(el).find('a[href*="/manga/"]').each((_, linkEl) => {
              const h3 = $(linkEl).find('h3');
              if (h3.length > 0) {
                title = h3.text().trim();
                mangaUrl = $(linkEl).attr('href') || '';
                return false;
              }
            });
          }

          if (mangaUrl && !mangaUrl.startsWith('http')) {
            mangaUrl = this.BASE_URL + mangaUrl;
          }

          let lastUpdateMs = 0;
          $(el).find('p').each((_, pEl) => {
            const text = $(pEl).text().trim();
            if (text.toLowerCase().includes('update')) {
              lastUpdateMs = parseUpdateToMs(text);
              return false;
            }
          });

          let firstChapter: SearchChapterInfo | null = null;
          let latestChapter: SearchChapterInfo | null = null;

          $(el).find('div.new1, .new1').each((_, newEl) => {
            const link = $(newEl).find('a');
            if (link.length > 0) {
              const spans = link.find('span');

              if (spans.length >= 2) {
                const label = spans.first().text().trim().toLowerCase();
                const chapterTitle = spans.last().text().trim();
                const chapterUrl = link.attr('href') || '';

                const fullUrl = chapterUrl && !chapterUrl.startsWith('http')
                  ? this.BASE_URL + chapterUrl
                  : chapterUrl;

                const chapterSlug = getSlugFromUrl(chapterUrl);

                if (label.includes('awal') || label.includes('first')) {
                  firstChapter = {
                    title: chapterTitle,
                    url: fullUrl,
                    slug: chapterSlug
                  };
                } else if (label.includes('terbaru') || label.includes('latest')) {
                  latestChapter = {
                    title: chapterTitle,
                    url: fullUrl,
                    slug: chapterSlug
                  };
                }
              }
            }
          });

          if (title && mangaUrl) {
            const slug = getSlugFromUrl(mangaUrl);
            const detail = await this.getDetail(slug);

            results.push({
              title,
              mangaUrl,
              thumbnailUrl,
              type,
              genre,
              lastUpdateMs,
              firstChapter,
              latestChapter,
              detail
            });
          }
        } catch (error) {
          console.error('Error parsing search item:', error);
        }
      }

      return this.wrapResponse(results);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error on search:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
      } else {
        console.error('Error on search:', error);
      }
      return [];
    }
  }

  async getDetail(slug: string): Promise<ApiResponse<MangaDetail | null>> {
    try {
      const { data } = await axios.get<string>(`${this.BASE_URL}/manga/${slug}`);
      const $ = cheerio.load(data);
      let results: MangaDetail | null = null;

      $('.series').each((_, el) => {
        const keyMap: KeyMapType = {
          'Judul Komik': 'title',
          'Judul Indonesia': 'indonesia_title',
          'Jenis Komik': 'type',
          'Pengarang': 'author',
          'Status': 'status'
        };

        const info: Partial<MangaDetail> = {};

        $(el).find('table.inftable tr').each((_, el) => {
          const key = $(el).find('td:first-child').text().trim();
          const value = $(el).find('td:last-child').text().trim();

          if (keyMap[key]) {
            info[keyMap[key]] = value;
          }
        });

        const genre: string[] = [];
        $('ul.genre li.genre span[itemprop="genre"]').each((_, el) => {
          genre.push($(el).text().trim());
        });

        const synopsis = $('p.desc').text().trim();
        let thumbnailUrl = $('div.ims img[itemprop="image"]').attr("src")?.trim() || '';
        thumbnailUrl = resizeThumbnail(thumbnailUrl);

        const chapters: ChapterInfo[] = [];
        $('table#Daftar_Chapter tr:not(:first-child)').each((_, el) => {
          const chapter = $(el).find('td.judulseries a span').text().trim();
          const slug_chapter = $(el).find('td.judulseries a').attr('href')?.replace(/\//g, '') || '';
          const views = $(el).find('td.pembaca i').text().trim();
          const date = $(el).find('td.tanggalseries').text().trim();

          chapters.push({ chapter, slug_chapter, views, date });
        });

        results = {
          ...info,
          thumbnailUrl,
          synopsis,
          genre,
          chapters
        } as MangaDetail;
      });

      return this.wrapResponse(results);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error fetching detail:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
      } else {
        console.error('Error fetching detail:', error);
      }
      return null;
    }
  }

  async readChapter(chapterSlug: string): Promise<ApiResponse<ChapterRead | null>> {
    try {
      const { data } = await axios.get<string>(`${this.BASE_URL}/${chapterSlug}/`);
      const $ = cheerio.load(data);
      const title = $('#Judul h1').text().trim();
      const images: ChapterImage[] = [];

      $('#Baca_Komik img').each((_, el) => {
        const imageUrl = $(el).attr('src') || '';
        const index = parseInt($(el).attr('id') || '0');

        if (imageUrl && index) {
          images.push({
            index,
            imageUrl
          });
        }
      });

      let prevChapterUrl: string | null = null;

      $('.toolbar a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).attr('title') || '';

        if (title.toLowerCase().includes('sebelumnya') || title.toLowerCase().includes('prev')) {
          prevChapterUrl = href.startsWith('http') ? href : `${this.BASE_URL}${href}`;
        }
      });

      images.sort((a, b) => a.index - b.index);

      const result: ChapterRead = {
        title,
        totalImages: images.length,
        images,
        prevChapterUrl
      } as ChapterRead;

      return this.wrapResponse(result);

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error reading chapter:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
      } else {
        console.error('Error reading chapter:', error);
      }
      return null;
    }
  }

  async getLatestPopularManga(): Promise<ApiResponse<LatestManga[]> | []> {
    try {
      const { data } = await axios.get<string>(this.BASE_URL);
      const $ = cheerio.load(data);
      const results: LatestManga[] = [];

      $(".home #Komik_Hot_Manga article.ls2").each((_, el) => {
        try {
          const title = $(el).find(".ls2j h3 a").text().trim();
          const mangaUrlPath = $(el).find(".ls2j h3 a").attr("href");
          const mangaUrl = mangaUrlPath ? `${this.BASE_URL}${mangaUrlPath}` : '';
          const slug = mangaUrl ? getSlugFromUrl(mangaUrl) : '';

          let thumbnailUrl =
            $(el).find("img").attr("data-src") ||
            $(el).find("img").attr("src") ||
            '';
          thumbnailUrl = resizeThumbnail(thumbnailUrl);

          const genreView = $(el).find(".ls2t").text().trim();
          const latestChapter = $(el).find(".ls2l").text().trim();
          const chapterUrlPath = $(el).find(".ls2l").attr("href");
          const chapterUrl = chapterUrlPath ? `${this.BASE_URL}${chapterUrlPath}` : '';

          if (title && mangaUrl) {
            results.push({
              title,
              mangaUrl,
              thumbnailUrl,
              genreView,
              slug,
              latestChapter,
              chapterUrl
            });
          }
        } catch (error) {
          console.error('Error parsing manga item:', error);
        }
      });

      return this.wrapResponse(results);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error fetching latest manga:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
      } else {
        console.error('Error fetching latest manga:', error);
      }
      return [];
    }
  }

  async getLatestPopularManhwa(): Promise<ApiResponse<LatestManga[]> | []> {
    try {
      const { data } = await axios.get<string>(this.BASE_URL);
      const $ = cheerio.load(data);
      const results: LatestManga[] = [];

      $(".home #Komik_Hot_Manhwa article.ls2").each((_, el) => {
        try {
          const title = $(el).find(".ls2j h3 a").text().trim();
          const mangaUrlPath = $(el).find(".ls2j h3 a").attr("href");
          const mangaUrl = mangaUrlPath ? `${this.BASE_URL}${mangaUrlPath}` : '';
          const slug = mangaUrl ? getSlugFromUrl(mangaUrl) : '';

          let thumbnailUrl =
            $(el).find("img").attr("data-src") ||
            $(el).find("img").attr("src") ||
            '';
          thumbnailUrl = resizeThumbnail(thumbnailUrl);

          const genreView = $(el).find(".ls2t").text().trim();
          const latestChapter = $(el).find(".ls2l").text().trim();
          const chapterUrlPath = $(el).find(".ls2l").attr("href");
          const chapterUrl = chapterUrlPath ? `${this.BASE_URL}${chapterUrlPath}` : '';

          if (title && mangaUrl) {
            results.push({
              title,
              mangaUrl,
              thumbnailUrl,
              genreView,
              slug,
              latestChapter,
              chapterUrl
            });
          }
        } catch (error) {
          console.error('Error parsing manga item:', error);
        }
      });

      return this.wrapResponse(results);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error fetching latest manga:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
      } else {
        console.error('Error fetching latest manga:', error);
      }
      return [];
    }
  }

  async getLatestPopularManhua(): Promise<ApiResponse<LatestManga[]> | []> {
    try {
      const { data } = await axios.get<string>(this.BASE_URL);
      const $ = cheerio.load(data);
      const results: LatestManga[] = [];

      $(".home #Komik_Hot_Manhua article.ls2").each((_, el) => {
        try {
          const title = $(el).find(".ls2j h3 a").text().trim();
          const mangaUrlPath = $(el).find(".ls2j h3 a").attr("href");
          const mangaUrl = mangaUrlPath ? `${this.BASE_URL}${mangaUrlPath}` : '';
          const slug = mangaUrl ? getSlugFromUrl(mangaUrl) : '';

          let thumbnailUrl =
            $(el).find("img").attr("data-src") ||
            $(el).find("img").attr("src") ||
            '';
          thumbnailUrl = resizeThumbnail(thumbnailUrl);

          const genreView = $(el).find(".ls2t").text().trim();
          const latestChapter = $(el).find(".ls2l").text().trim();
          const chapterUrlPath = $(el).find(".ls2l").attr("href");
          const chapterUrl = chapterUrlPath ? `${this.BASE_URL}${chapterUrlPath}` : '';

          if (title && mangaUrl) {
            results.push({
              title,
              mangaUrl,
              thumbnailUrl,
              genreView,
              slug,
              latestChapter,
              chapterUrl
            });
          }
        } catch (error) {
          console.error('Error parsing manga item:', error);
        }
      });

      return this.wrapResponse(results);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error fetching latest manga:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText
        });
      } else {
        console.error('Error fetching latest manga:', error);
      }
      return [];
    }
  }
}
