import type { PluginHandler } from "@yuki/types";
import axios from "axios";
import { uploader } from "libs/uploadImage";

async function pollTaskStatus(taskUrl: string, maxAttempts = 30, interval = 2000): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(taskUrl);
      const data = response.data;

      if (data.ok && data.status === "done" && data.url) {
        return data.url;
      }

      if (data.status === "failed" || data.status === "error") {
        throw new Error("Task processing failed");
      }

      if (data.status === "pending") {
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }

      throw new Error(`Unknown status: ${data.status}`);
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        throw error;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }
      throw new Error("Max polling attempts reached");
    }
  }
  
  throw new Error("Task timeout - max attempts reached");
}

let handler: PluginHandler = {
  name: "HD Image",
  description: "Enhance your images to make them clearer.",
  usage: [".hd <your-image>"],
  tags: ["media"],
  limit: 2,
  register: true,
  cmd: ["hdr", "remini", "hd"],
  exec: async (m, { conn, command, usedPrefix }) => {
    conn!!.enhancer = conn!!.enhancer ? conn!!.enhancer : {};
    if (m.sender in conn!!.enhancer) 
      return conn!!.reply(m.chat, "❌ Your process is not yet complete, please wait until the process is complete.", m);
      
    if (Object.keys(conn!!.enhancer).length > 0) {
      return conn!!.reply(m.chat, "⚠️ *Another user has already used this feature, please wait until the process is complete!*", m)
    }

    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || "";

    if (!mime) 
      return conn!!.reply(m.chat, `Send/Reply Images with the caption *${usedPrefix + command!!}*`, m);

    if (!/image\/(jpe?g|png)/.test(mime))
      return conn!!.reply(m.chat, `Mime ${mime} is not supported`, m);
    
    conn!!.enhancer[m.sender] = true;
    m.react("⏳");

    let img = await q.download?.();
    let error: any;

    try {
      let imgUrl = await uploader(img);
      
      let api = await axios.get(
        `${global.APIs.PaxSenix}/ai-tools/ihancer?url=${encodeURIComponent(imgUrl.url!)}&method=1&size=high`, 
        { headers: { Authorization: global.APIKeys.PaxSenixAPIKey } }
      );

      if (api.data.ok && api.data.url) {
        m.react("✅");
        conn!!.sendFile(m.chat, api.data.url, "hd.jpg", "", m);
      } else if (api.data.task_url || typeof api.data === 'string') {
        const taskUrl = api.data.task_url || api.data;
 
        m.react("🔄");

        const resultUrl = await pollTaskStatus(taskUrl, 60, 2000);
        
        m.react("✅");
        conn!!.sendFile(m.chat, resultUrl, "hd.jpg", "", m);
      } else {
        throw new Error("Unexpected API response format");
      }
    } catch (e) {
      error = e;
      console.error("Enhancement error:", e);
    } finally {
      if (error) {
        m.react("❌");
        delete conn!!.enhancer[m.sender];
        const errorMsg = error instanceof Error ? error.message : "Process Failed...";
        throw errorMsg;
      }
      delete conn!!.enhancer[m.sender];
    }
  }
}

export default handler;
