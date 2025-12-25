import axios, { AxiosError } from "axios";
import crypto from "node:crypto";

interface AudioFormat {
  quality: number;
  url: string | null;
  label: string;
}

interface VideoFormat {
  height: number;
  width: number;
  url: string;
  quality: number;
  label: string;
  default_selected: 0 | 1;
}

interface ThumbnailFormat {
  label: string;
  quality: string;
  value: string;
  url: string;
}

interface VideoInfo {
  id: string;
  key: string;
  url: string;
  title: string;
  titleSlug: string;
  thumbnail: string;
  duration: number;
  durationLabel: string;
  audio_formats: AudioFormat[];
  video_formats: VideoFormat[];
  thumbnail_formats: ThumbnailFormat[];
  default_selected: number;
  fromCache: boolean;
}

interface DownloadResponse {
  downloadUrl: string;
  downloaded: boolean;
}

interface ErrorResponse {
  error: Error | AxiosError;
  statusCode?: number;
}

interface RandomCdnResponse {
  cdn: string;
}

interface CacheEntry<T> {
  value: T;
  expiry: number;
}


function Retry(maxAttempts: number = 3, delayMs: number = 1000) {
  return function(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      let lastError: any;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) {
            await new Promise((resolve) =>
              setTimeout(resolve, delayMs * attempt)
            );
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}

function Cache(ttlMs: number = 60000) {
  const cache = new Map<string, CacheEntry<any>>();

  return function(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const cacheKey = `${propertyKey}_${JSON.stringify(args)}`;
      const cached = cache.get(cacheKey);

      if (cached && Date.now() < cached.expiry) {
        return cached.value;
      }

      const result = await originalMethod.apply(this, args);

      cache.set(cacheKey, {
        value: result,
        expiry: Date.now() + ttlMs,
      });

      return result;
    };

    return descriptor;
  };
}


class SaveTubeClient {
  private readonly ENCRYPTION_KEY_STRING: string =
    "C5D58EF67A7584E4A29F6C35BBC4EB12";

  @Cache(300000)
  @Retry(3, 1000)
  async getRandomCdn(): Promise<string> {
    const response = await axios.get<RandomCdnResponse>(
      "https://media.savetube.me/api/random-cdn",
      {
        timeout: 10000,
      }
    );
    return response.data.cdn;
  }

  private hexToUint8Array(hexString: string): Uint8Array {
    try {
      const matched = hexString.match(/[\dA-F]{2}/gi);
      if (!matched) throw new Error("Invalid format");
      return new Uint8Array(matched.map((h) => parseInt(h, 16)));
    } catch (err) {
      console.error("Invalid format error:", err);
      throw err;
    }
  }

  private async getDecryptionKey(): Promise<CryptoKey> {
    try {
      const keyData = this.hexToUint8Array(this.ENCRYPTION_KEY_STRING);
      // @ts-ignore
      return await crypto.webcrypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
      );
    } catch (err) {
      console.error("Process initialization failed:", err);
      throw err;
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const buf = Buffer.from(base64.replace(/\s/g, ""), "base64");
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (err) {
      throw new Error(`Format error: ${(err as Error).message}`);
    }
  }

  private async decryptApiResponse(encryptedData: string): Promise<VideoInfo> {
    try {
      const dataBuffer = this.base64ToArrayBuffer(encryptedData);
      if (dataBuffer.byteLength < 16) {
        throw new Error("Invalid format: insufficient length");
      }

      const iv = dataBuffer.slice(0, 16);
      const ciphertext = dataBuffer.slice(16);
      const key = await this.getDecryptionKey();

      const decrypted = await crypto.webcrypto.subtle.decrypt(
        { name: "AES-CBC", iv: new Uint8Array(iv) },
        key,
        ciphertext
      );

      const text = new TextDecoder().decode(new Uint8Array(decrypted));
      return JSON.parse(text);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  @Retry(3, 1500)
  async getVideoInfo(url: string): Promise<VideoInfo | ErrorResponse> {
    const cdnHost = await this.getRandomCdn();
    try {
      const res = await axios.post<{ data: string }>(
        `https://${cdnHost}/v2/info`,
        { url },
        {
          timeout: 30000,
        }
      );
      return this.decryptApiResponse(res.data.data);
    } catch (err) {
      return {
        error: err as AxiosError,
        statusCode: (err as AxiosError)?.response?.status,
      };
    }
  }

  @Retry(3, 1500)
  async getDownload(
    key: string,
    downloadType: "video" | "audio" = "video",
    quality: number = 360
  ): Promise<DownloadResponse | ErrorResponse> {
    const cdnHost = await this.getRandomCdn();
    try {
      const res = await axios.post<{ data: DownloadResponse }>(
        `https://${cdnHost}/download`,
        {
          downloadType,
          quality,
          key,
        },
        {
          timeout: 30000,
        }
      );
      return res.data.data;
    } catch (err) {
      return {
        error: err as AxiosError,
        statusCode: (err as AxiosError)?.response?.status,
      };
    }
  }

  getVideoFormatByQuality(
    videoInfo: VideoInfo,
    quality: number
  ): VideoFormat | undefined {
    return videoInfo.video_formats.find((format) => format.quality === quality);
  }

  getDefaultVideoFormat(videoInfo: VideoInfo): VideoFormat | undefined {
    return videoInfo.video_formats.find(
      (format) => format.default_selected === 1
    );
  }

  getAvailableQualities(videoInfo: VideoInfo): number[] {
    return videoInfo.video_formats.map((format) => format.quality);
  }
}

export default SaveTubeClient;

export type {
  VideoInfo,
  AudioFormat,
  VideoFormat,
  ThumbnailFormat,
  DownloadResponse,
  ErrorResponse,
};
