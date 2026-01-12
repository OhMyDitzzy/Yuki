import type { PluginHandler } from "@yuki/types";
import axios, { type AxiosRequestConfig } from "axios";

interface CarouselItems {
  type: string
  url: string
  thumbnail: string
}

interface Response {
  type: string
  id: string
  url: string
  thumbnail: string
  username: string
  caption: string
  mediaUrls: string[]
  carouselItems?: CarouselItems[]
  videoMetadata?: {
    duration: string
  }
}

interface ApiResponse<T> {
  created_by: string;
  note: string;
  results: T;
}

class Instagram {
  private API_URL: string;
  private HEADERS: any;
  private CREATED_BY: string;
  private NOTE: string;

  constructor() {
    this.API_URL = "https://thesocialcat.com/api/instagram-download";
    this.HEADERS = {
      "accept": "*/*",
      "accept-language": "id-ID",
      "content-type": "application/json",
      "Referer": "https://thesocialcat.com/tools/instagram-video-downloader",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };

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

  async download(url: string): Promise<ApiResponse<Response>> {
    try {
      const config: AxiosRequestConfig = {
        url: this.API_URL,
        headers: this.HEADERS,
        method: "POST",
        data: {
          url
        }
      }

      const { data } = await axios.request(config);
      return this.wrapResponse(data);
    } catch (e) {
      throw new Error("Emror: ", e);
    }
  }
}

let handler: PluginHandler = {
  name: "Instagram Downloader",
  description: "Download Instagram Media",
  tags: ["downloader"],
  register: true,
  limit: 2,
  cmd: ["ig", "igdl"],
  exec: async (m, { text, conn, usedPrefix, command }) => {
    if (!text) throw `• No link detected, please provide the link. Example: ${usedPrefix + command} <link>`;

    m.react("⏳");
    const ig = new Instagram();
    try {
      const res = await ig.download(text);

      if (res.results.type === "video") {
        const vid = res.results.mediaUrls[0];

        await conn.sendFile(m.chat, vid, "ig.mp4", res.results.caption, m);
        m.react("✅");
      } else if (res.results.type === "carousel") {
        const albumMessage = res.results.mediaUrls.map(i => ({ image: { url: i } }))
        await conn.sendAlbumMessage(m.chat, albumMessage, { quoted: m })
        m.react("✅");
      } else if (res.results.type === "image") {
        const img = res.results.mediaUrls[0];

        await conn.sendFile(m.chat, img, "ig.png", res.results.caption, m);
        m.react("✅");
      } else {
        throw `• Search result failed`;
      }
    } catch (e) {
      m.react("❌")
      console.log(e);
      conn.error(m, e)
    }
  }
}

export default handler;
