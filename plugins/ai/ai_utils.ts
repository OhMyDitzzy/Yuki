import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import { fileTypeFromBuffer, type FileTypeResult } from "file-type";
import { readFileSync } from "node:fs";
import CryptoJS from "crypto-js";

interface AIEnhancerConfig {
  size?: "2K" | "4K" | "8K";
  aspect_ratio?: string;
  output_format?: "jpg" | "png" | "webp";
  sequential_image_generation?: "enabled" | "disabled";
  max_images?: number;
  prompt?: string;
  go_fast?: boolean;
  output_quality?: number;
  disable_safety_checker?: boolean;
  [key: string]: any;
}

interface AIRemoverConfig {
  threshold?: number;
  reverse?: boolean;
  format?: "jpg" | "jpeg" | "png" | "webp";
  background_type?: string;
}

interface AIEnhancerUpscaleConfig {
  version?: string;
  scale?: number;
  upscale?: boolean;
  codeformer_fidelity?: number;
  background_enhance?: boolean;
  face_upsample?: boolean;
  image_size?: string;
  output_format?: "jpg" | "jpeg" | "png" | "webp",
  prompt?: string;
}

interface TaskResponse {
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

interface ApiResponse<T> {
  created_by: string;
  note: string;
  results: T;
}

const ModelMap = {
  nano_banana: 2,
  seed_dream: 5,
  flux: 8,
  qwen_image: 9
} as const;

type ModelName = keyof typeof ModelMap;
type ModelId = typeof ModelMap[ModelName];

const IMAGE_TO_ANIME_PRESETS: Record<string, AIEnhancerConfig> = {
  manga: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "jpg",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into a KOREAN-STYLE MANGA illustration. Apply strong stylization with clear and noticeable differences from the original image."
  },

  anime: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "jpg",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into an ANIME-STYLE illustration. Apply strong stylization with clear and noticeable differences from the original image."
  },

  ghibli: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "jpg",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into a STUDIO GHIBLI-STYLE illustration. Apply strong stylization with clear and noticeable differences from the original image."
  },

  cyberpunk: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "jpg",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into a CYBERPUNK-STYLE illustration with neon colors, futuristic elements, and dark atmosphere."
  },

  watercolor: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "png",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into a WATERCOLOR painting style with soft brush strokes and pastel colors."
  },

  pixelart: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "png",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into PIXEL ART style with 8-bit retro gaming aesthetic."
  },

  sketch: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "jpg",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into a detailed PENCIL SKETCH with realistic shading and artistic strokes."
  },

  oilpainting: {
    size: "2K",
    aspect_ratio: "match_input_image",
    output_format: "jpg",
    sequential_image_generation: "disabled",
    max_images: 1,
    prompt: "Convert the provided image into an OIL PAINTING style with thick brush strokes and rich colors."
  }
};

const IMAGE_TO_ANIME_ENCRYPTED_PAYLOADS: Record<string, string> = {
  manga: "L7p91uXhVyp5OOJthAyqjSqhlbM+RPZ8+h2Uq9tz6Y+4Agarugz8f4JjxjEycxEzuj/7+6Q0YY9jUvrfmqkucENhHAkMq1EOilzosQlw2msQpW2yRqV3C/WqvP/jrmSu3aUVAyeFhSbK3ARzowBzQYPVHtxwBbTWwlSR4tehnodUasnmftnY77c8gIFtL2ArNdzmPLx5H8O9un2U8WE4s0+xiFV3y4sbetHMN7rHh7DRIpuIQD4rKISR/vE+HeaHpRavXfsilr5P7Y6bsIo+RRFIPgX2ofbYYiATziqsjDeie4IlcOAVf1Pudqz8uk6YKM78CGxjF9iPLYQnkW+c6j96PNsg1Yk4Xz8/ZcdmHF4GGZe8ILYH/D0yyM1dsCkK1zY8ciL+6pAk4dHIZ/4k9A==",
  ghibli: "L7p91uXhVyp5OOJthAyqjSqhlbM+RPZ8+h2Uq9tz6Y+4Agarugz8f4JjxjEycxEzuj/7+6Q0YY9jUvrfmqkucENhHAkMq1EOilzosQlw2msQpW2yRqV3C/WqvP/jrmSu3aUVAyeFhSbK3ARzowBzQYPVHtxwBbTWwlSR4tehnodUasnmftnY77c8gIFtL2ArNdzmPLx5H8O9un2U8WE4syzL5EYHGJWC1rlQM9xhNe1PViOsBSxmwHVwOdqtxZtcAJmGuzTgG7JVU7Hr9ZRwajhYK5yxQwSdJGwwR4jjS1yF9s9wKUQqgI+fYxaw7FZziLS+9JG5pTEjch4D0fpl+LO7vIynHN4cyu4DDeAUwNeYfbGMn2QQs+5OgMdViCAM1GkJk2jhlQm10rESTjDryw==",
  anime: "L7p91uXhVyp5OOJthAyqjSqhlbM+RPZ8+h2Uq9tz6Y+4Agarugz8f4JjxjEycxEzuj/7+6Q0YY9jUvrfmqkucENhHAkMq1EOilzosQlw2msQpW2yRqV3C/WqvP/jrmSu3aUVAyeFhSbK3ARzowBzQYPVHtxwBbTWwlSR4tehnodUasnmftnY77c8gIFtL2ArNdzmPLx5H8O9un2U8WE4s7O2FxvQPCjt2uGmHPMOx1DsNSnLvzCKPVdz8Ob1cPHePmmquQZlsb/p+8gGv+cizSiOL4ts6GD2RxWN+K5MmpA/F3rQXanFUm4EL0g7qZCQbChRRQyaAyZuxtIdTKsmsMzkVKM5Sx96eV7bEjUAJ52j6NcP96INv2DhnWTP7gB6tltFQe8B8SPS2LuLRuPghA=="
};

export class AIEnhancer {
  private readonly CREATED_BY = "Ditzzy";
  private readonly NOTE = "Thank you for using this scrape, I hope you appreciate me for making this scrape by not deleting wm";

  private readonly AES_KEY = "ai-enhancer-web__aes-key";
  private readonly AES_IV = "aienhancer-aesiv";

  private readonly HEADERS = {
    "accept": "*/*",
    "content-type": "application/json",
    "Referer": "https://aienhancer.ai",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };

  private readonly POLLING_INTERVAL = 2000;
  private readonly MAX_POLLING_ATTEMPTS = 120;

  private encrypt(data: object | string): string {
    const plaintext = typeof data === "string" ? data : JSON.stringify(data);

    return CryptoJS.AES.encrypt(
      plaintext,
      CryptoJS.enc.Utf8.parse(this.AES_KEY),
      {
        iv: CryptoJS.enc.Utf8.parse(this.AES_IV),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    ).toString();
  }

  private decrypt(encryptedData: string): string {
    const decrypted = CryptoJS.AES.decrypt(
      encryptedData,
      CryptoJS.enc.Utf8.parse(this.AES_KEY),
      {
        iv: CryptoJS.enc.Utf8.parse(this.AES_IV),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  private decryptToJSON<T = any>(encryptedData: string): T {
    const decrypted = this.decrypt(encryptedData);
    return JSON.parse(decrypted);
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

  private async processImage(image: string | Buffer): Promise<{ base64: string; mime: string }> {
    let img: Buffer;
    let type: FileTypeResult | undefined;

    if (typeof image === "string") {
      img = readFileSync(image);
      type = await fileTypeFromBuffer(img);
    } else if (Buffer.isBuffer(image)) {
      img = image;
      type = await fileTypeFromBuffer(image);
    } else {
      throw new Error("Invalid image input: must be file path (string) or Buffer");
    }

    if (!type) {
      throw new Error("Could not detect file type");
    }

    const allowedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/bmp'
    ];

    if (!allowedImageTypes.includes(type.mime)) {
      throw new Error(
        `Unsupported format: ${type.mime}. Allowed: jpeg, jpg, png, webp, gif, bmp`
      );
    }

    const imgbase64 = img.toString("base64");
    return {
      base64: `data:${type.mime};base64,${imgbase64}`,
      mime: type.mime
    };
  }

  private async createTask(
    apiUrl: string,
    model: number,
    image: string | Buffer,
    config: AIEnhancerConfig | AIEnhancerUpscaleConfig | AIRemoverConfig | string
  ): Promise<string> {
    const { base64 } = await this.processImage(image);

    const settings = typeof config === "string"
      ? config
      : this.encrypt(config);

    const requestConfig: AxiosRequestConfig = {
      url: apiUrl,
      method: "POST",
      headers: this.HEADERS,
      data: {
        model,
        image: base64,
        settings
      }
    };

    const { data } = await axios.request<TaskResponse>(requestConfig);

    if (data.code !== 100000 || !data.data.id) {
      throw new Error(`Task creation failed: ${data.message}`);
    }

    return data.data.id;
  }

  private async checkTaskStatus(resultUrl: string, taskId: string): Promise<TaskResponse> {
    const config: AxiosRequestConfig = {
      url: resultUrl,
      method: "POST",
      headers: this.HEADERS,
      data: { task_id: taskId }
    };

    const { data } = await axios.request<TaskResponse>(config);
    return data;
  }

  private async pollTaskResult(resultUrl: string, taskId: string): Promise<TaskResult> {
    let attempts = 0;

    while (attempts < this.MAX_POLLING_ATTEMPTS) {
      const response = await this.checkTaskStatus(resultUrl, taskId);

      if (response.code !== 100000) {
        throw new Error(`Status check failed: ${response.message}`);
      }

      const { status, error, output, input, completed_at } = response.data;

      if (status === "succeeded" || status === "success" && output && input) {
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

      if (status === "failed" || status === "fail" || error) {
        throw new Error(`Task failed: ${error || "Unknown error"}`);
      }

      console.log(`[${taskId} | ${status}] Polling attempt ${attempts + 1}/${this.MAX_POLLING_ATTEMPTS}`);

      await this.sleep(this.POLLING_INTERVAL);
      attempts++;
    }

    throw new Error(`Task timeout after ${this.MAX_POLLING_ATTEMPTS} attempts`);
  }

  async imageToAnime(
    image: string | Buffer,
    preset: keyof typeof IMAGE_TO_ANIME_PRESETS | AIEnhancerConfig | string = "anime"
  ): Promise<ApiResponse<TaskResult>> {
    try {
      const apiUrl = "https://aienhancer.ai/api/v1/r/image-enhance/create";
      const resultUrl = "https://aienhancer.ai/api/v1/r/image-enhance/result";
      const model = 5;

      let config: AIEnhancerConfig | string;

      if (typeof preset === "string") {
        if (IMAGE_TO_ANIME_PRESETS[preset]) {
          config = IMAGE_TO_ANIME_PRESETS[preset];
        }
        else if (IMAGE_TO_ANIME_ENCRYPTED_PAYLOADS[preset]) {
          config = IMAGE_TO_ANIME_ENCRYPTED_PAYLOADS[preset];
        }
        else {
          config = preset;
        }
      } else {
        config = preset;
      }

      const taskId = await this.createTask(apiUrl, model, image, config);
      console.log(`✓ Task created: ${taskId}`);

      const result = await this.pollTaskResult(resultUrl, taskId);
      return this.wrapResponse(result);
    } catch (error) {
      throw new Error(`Image to anime conversion failed: ${error}`);
    }
  }

  async ImageAIEditor(
    image: string | Buffer,
    model: ModelName,
    preset: AIEnhancerConfig
  ) {
    try {
      const apiUrl = "https://aienhancer.ai/api/v1/k/image-enhance/create";
      const resultUrl = "https://aienhancer.ai/api/v1/k/image-enhance/result";

      const modelId: ModelId = ModelMap[model];
      const taskId = await this.createTask(apiUrl, modelId, image, preset);
      const result = await this.pollTaskResult(resultUrl, taskId);

      return this.wrapResponse(result);
    } catch (e) {
      throw new Error("Image editor failed: " + e)
    }
  }

  async AIImageRestoration(
    image: string | Buffer,
    model: 1 | 2 | 3,
    config: AIEnhancerUpscaleConfig
  ) {
    try {
      const apiUrl = "https://aienhancer.ai/api/v1/r/image-enhance/create";
      const resultUrl = "https://aienhancer.ai/api/v1/r/image-enhance/result";

      const taskId = await this.createTask(apiUrl, model, image, config);
      const result = await this.pollTaskResult(resultUrl, taskId);

      return this.wrapResponse(result);
    } catch (e) {
      throw new Error(`An error occurred while upscaling the image: ${e}`)
    }
  }

  async RemoveBackground(
    image: string | Buffer,
    config: AIRemoverConfig = {}
  ) {
    try {
      const apiUrl = "https://aienhancer.ai/api/v1/r/image-enhance/create";
      const resultUrl = "https://aienhancer.ai/api/v1/r/image-enhance/result";
      const model = 4;

      const payloadConfig: AIRemoverConfig = config ? config : {
        threshold: 0,
        reverse: false,
        background_type: "rgba",
        format: "png",
      }

      const taskId = await this.createTask(apiUrl, model, image, payloadConfig);
      const result = await this.pollTaskResult(resultUrl, taskId);

      return this.wrapResponse(result)
    } catch (e) {
      throw new Error(`Remove background error: ${e}`)
    }
  }

  decryptPayload(encryptedPayload: string): AIEnhancerConfig {
    return this.decryptToJSON<AIEnhancerConfig>(encryptedPayload);
  }

  encryptConfig(config: AIEnhancerConfig): string {
    return this.encrypt(config);
  }
}