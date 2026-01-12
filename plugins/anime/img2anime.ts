import type { PluginHandler } from "@yuki/types";
import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import { readFileSync } from "node:fs";
import { fileTypeFromBuffer, type FileTypeResult } from "file-type"

interface ApiResponse<T> {
  created_by: string;
  note: string;
  results: T;
}

interface CreateTaskResponse {
  code: number;
  data: {
    id: string;
    output: string | null;
    input: string | null;
    error: string | null;
    status: string | null;
    created_at: string | null;
    started_at: string | null;
    completed_at: string | null;
  };
  message: string;
}

interface TaskResult {
  id: string;
  output: string;
  input: string;
  error: string | null;
  status: string;
  created_at: string | null;
  started_at: string | null;
  completed_at: string;
}

type StyleType = "anime" | "manga" | "ghibli";

export class Img2Anime {
  private CREATED_BY: string;
  private NOTE: string;
  private API_URL: string;
  private RESULT_URL: string;
  private HEADERS: Record<string, string>;
  private STYLE_PAYLOADS: Record<StyleType, string>;
  private POLLING_INTERVAL: number;
  private MAX_POLLING_ATTEMPTS: number;

  constructor() {
    this.CREATED_BY = "Ditzzy";
    this.NOTE = "Thank you for using this scrape, I hope you appreciate me for making this scrape by not deleting wm";
    this.API_URL = "https://aienhancer.ai/api/v1/r/image-enhance/create";
    this.RESULT_URL = "https://aienhancer.ai/api/v1/r/image-enhance/result";
    this.HEADERS = {
      "accept": "*/*",
      "content-type": "application/json",
      "Referer": "https://aienhancer.ai",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    this.STYLE_PAYLOADS = {
      manga: "L7p91uXhVyp5OOJthAyqjSqhlbM+RPZ8+h2Uq9tz6Y+4Agarugz8f4JjxjEycxEzuj/7+6Q0YY9jUvrfmqkucENhHAkMq1EOilzosQlw2msQpW2yRqV3C/WqvP/jrmSu3aUVAyeFhSbK3ARzowBzQYPVHtxwBbTWwlSR4tehnodUasnmftnY77c8gIFtL2ArNdzmPLx5H8O9un2U8WE4s0+xiFV3y4sbetHMN7rHh7DRIpuIQD4rKISR/vE+HeaHpRavXfsilr5P7Y6bsIo+RRFIPgX2ofbYYiATziqsjDeie4IlcOAVf1Pudqz8uk6YKM78CGxjF9iPLYQnkW+c6j96PNsg1Yk4Xz8/ZcdmHF4GGZe8ILYH/D0yyM1dsCkK1zY8ciL+6pAk4dHIZ/4k9A==",
      ghibli: "L7p91uXhVyp5OOJthAyqjSqhlbM+RPZ8+h2Uq9tz6Y+4Agarugz8f4JjxjEycxEzuj/7+6Q0YY9jUvrfmqkucENhHAkMq1EOilzosQlw2msQpW2yRqV3C/WqvP/jrmSu3aUVAyeFhSbK3ARzowBzQYPVHtxwBbTWwlSR4tehnodUasnmftnY77c8gIFtL2ArNdzmPLx5H8O9un2U8WE4syzL5EYHGJWC1rlQM9xhNe1PViOsBSxmwHVwOdqtxZtcAJmGuzTgG7JVU7Hr9ZRwajhYK5yxQwSdJGwwR4jjS1yF9s9wKUQqgI+fYxaw7FZziLS+9JG5pTEjch4D0fpl+LO7vIynHN4cyu4DDeAUwNeYfbGMn2QQs+5OgMdViCAM1GkJk2jhlQm10rESTjDryw==",
      anime: "L7p91uXhVyp5OOJthAyqjSqhlbM+RPZ8+h2Uq9tz6Y+4Agarugz8f4JjxjEycxEzuj/7+6Q0YY9jUvrfmqkucENhHAkMq1EOilzosQlw2msQpW2yRqV3C/WqvP/jrmSu3aUVAyeFhSbK3ARzowBzQYPVHtxwBbTWwlSR4tehnodUasnmftnY77c8gIFtL2ArNdzmPLx5H8O9un2U8WE4s7O2FxvQPCjt2uGmHPMOx1DsNSnLvzCKPVdz8Ob1cPHePmmquQZlsb/p+8gGv+cizSiOL4ts6GD2RxWN+K5MmpA/F3rQXanFUm4EL0g7qZCQbChRRQyaAyZuxtIdTKsmsMzkVKM5Sx96eV7bEjUAJ52j6NcP96INv2DhnWTP7gB6tltFQe8B8SPS2LuLRuPghA=="
    };

    this.POLLING_INTERVAL = 2000;
    this.MAX_POLLING_ATTEMPTS = 120;
  }

  private wrapResponse<T>(data: T): ApiResponse<T> {
    return {
      created_by: this.CREATED_BY,
      note: this.NOTE,
      results: data
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async createTask(image: string | Buffer, style: StyleType): Promise<string> {
    let img: Buffer;
    let imgbase64: string;
    let type: FileTypeResult | undefined;

    if (typeof image === "string") {
      img = readFileSync(image);
      imgbase64 = img.toString("base64");
      type = await fileTypeFromBuffer(img);
    } else if (Buffer.isBuffer(image)) {
      imgbase64 = Buffer.from(image).toString("base64");
      type = await fileTypeFromBuffer(Buffer.from(image));
    } else {
      throw new Error("Invalid image input");
    }

    if (!type) throw new Error("File type not recognized");

    const base64Img = `data:${type.mime};base64,${imgbase64}`;
    const settingsPayload = this.STYLE_PAYLOADS[style];

    if (!settingsPayload) {
      throw new Error(`Invalid style: ${style}. Available styles: anime, manga, ghibli`);
    }

    const config: AxiosRequestConfig = {
      url: this.API_URL,
      method: "POST",
      headers: this.HEADERS,
      data: {
        model: 5,
        image: base64Img,
        settings: settingsPayload
      }
    };

    const { data } = await axios.request<CreateTaskResponse>(config);

    if (data.code !== 100000 || !data.data.id) {
      throw new Error(`Failed to create task: ${data.message}`);
    }

    return data.data.id;
  }

  private async checkTaskStatus(taskId: string): Promise<CreateTaskResponse> {
    const config: AxiosRequestConfig = {
      url: this.RESULT_URL,
      method: "POST",
      headers: this.HEADERS,
      data: {
        task_id: taskId
      }
    };

    const { data } = await axios.request<CreateTaskResponse>(config);
    return data;
  }

  private async pollTaskResult(taskId: string): Promise<TaskResult> {
    let attempts = 0;

    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      const response = await this.checkTaskStatus(taskId);

      if (response.code !== 100000) {
        throw new Error(`Failed to check task status: ${response.message}`);
      }

      const { status, error, output, input, completed_at } = response.data;

      if (status === "succeeded" && output && input) {
        return {
          id: taskId,
          output,
          input,
          error,
          status,
          created_at: response.data.created_at,
          started_at: response.data.started_at,
          completed_at: completed_at!
        };
      }

      if (status === "failed" || error) {
        throw new Error(`Task failed: ${error || "Unknown error"}`);
      }

      console.log(`[${taskId}] ${status || "processing"}... (Attempt ${attempts + 1}/${this.MAX_POLLING_ATTEMPTS})`);
      await this.sleep(this.POLLING_INTERVAL);
      attempts++;
    }

    throw new Error(`Task polling timeout after ${this.MAX_POLLING_ATTEMPTS} attempts`);
  }

  async generate(image: string | Buffer, style: StyleType = "anime") {
    try {
      const taskId = await this.createTask(image, style);
      console.log(`Task created with ID: ${taskId}`);

      const result = await this.pollTaskResult(taskId);

      console.log("Task completed successfully!");
      return this.wrapResponse(result);
    } catch (e) {
      throw new Error("Error: " + e);
    }
  }
}

let handler: PluginHandler = {
  name: "Image to Anime",
  description: "Convert image to Anime/Manga/Ghibli",
  tags: ["anime"],
  register: true,
  limit: 5,
  cmd: ["toanime", "img2anime"],
  exec: async (m, { usedPrefix, command, text }) => {
    let q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || '';
    if (!q.mediaType || !/image/.test(mime)) {
      return m.reply(`Reply to the image with the caption: ${usedPrefix + command} <anime|manga|ghibli>`)
    }

    m.react("⏳")
    try {
      const img2anime = new Img2Anime();
      const img = await q.download();
      const res = await img2anime.generate(img, text as StyleType || null);

      await conn.sendFile(m.chat, res.results.output, "img2anime.png", "✅ Success", m);
      m.react('✅')
    } catch (e) {
      m.react('❌')
      conn.error(m, e);
      console.error(e);
    }
  }
}

export default handler;
