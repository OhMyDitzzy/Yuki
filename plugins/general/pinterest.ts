import type { PluginHandler } from "@yuki/types";
import type { CarouselCard } from "types/buttons/interactive_message_button";

interface Result {
  caption: string
  url: string,
  source: string,
  media: {
    images: {
      original: {
        url: string
      }
    }
  },
  user: {
    username: string
    full_name: string
    followers: number
  }
}

interface APIResponse {
  results: Result[]
}

let handler: PluginHandler = {
  name: "Search pinterest",
  description: "Search images on Pinterest instantly",
  usage: [".pin <keyword>"],
  tags: ["public"],
  limit: 5,
  register: true,
  cmd: ["pin", "pinterest"],
  exec: async (m, { conn, text, usedPrefix, command }) => {
    if (!text) throw `• *What do you want to search? example:* ${usedPrefix + command} Yuki Souo`

    m.react("⏳");
    try {
      const start = performance.now();
      const response = await fetch(
        `${global.APIs.PaxSenix}/tools/search-pinterest?q=${encodeURIComponent(text)}&limit=20`,
        {
          headers: {
            'Authorization': global.APIKeys.PaxSenixAPIKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: APIResponse = await response.json();

      if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
        m.react("❌");
        throw "No results found";
      }

      let cards: CarouselCard[] = []
      let i = 0;

      for (let res of data.results) {
        let captions = `
• *Username:* ${res.user.username}
• *Followers:* ${res.user.followers}

${res.caption}
`

        cards.push({
          header: res.user.full_name,
          body: captions,
          footer: `Index of (${i++}/20)`,
          image: res.media.images.original.url,
          buttons: [{
            type: "url",
            text: "View Image",
            url: res.url
          }]
        })
      }

      let captions = `
• *Your request has been completed with keywords:*
${text}
`
      const end = performance.now()
      const responseTime = end - start;
      await conn!!.sendCarousel(m.chat, {
        body: {
          text: captions
        },
        footer: {
          text: `Completed in: ${responseTime.toFixed(2)}ms`
        },
      }, cards, { quoted: m } as any)
      
      m.react("✅");
    } catch (e) {
      m.react("❌")
      console.log(e)
      conn!!.error(m, e)
    }
  }
}

export default handler;