import { requestUrl, RequestUrlResponse } from "obsidian";
import { GetApiError } from "./errors";
import { GetListResponse } from "./types";

const BASE_URL = "https://www.biji.com";
const OPENAPI_BASE_URL = "https://openapi.biji.com";
const MIN_REQUEST_INTERVAL_MS = 650;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class GetApiClient {
  private apiKey: string;
  private clientId: string;
  private lastRequestAt = 0;

  constructor(apiKey: string, clientId: string) {
    this.apiKey = apiKey.trim();
    this.clientId = clientId.trim();
  }

  private get headers(): Record<string, string> {
    return {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      origin: BASE_URL,
      referer: `${BASE_URL}/note`,
      Authorization: this.apiKey,
      "X-Client-ID": this.clientId,
      "user-agent": "Obsidian Get Notes Plugin"
    };
  }

  private async waitForTurn(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - this.lastRequestAt));
    if (waitMs > 0) await sleep(waitMs);
    this.lastRequestAt = Date.now();
  }

  private async requestJson<T = unknown>(url: string): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.waitForTurn();
      const response = await requestUrl({
        url,
        method: "GET",
        headers: this.headers,
        throw: false
      });
      if (response.status >= 200 && response.status < 300) {
        return this.parseJson<T>(response);
      }

      const body = response.text || "";
      const isRateLimited = response.status === 429 || body.includes("qps_bucket_exceeded");
      if (isRateLimited && attempt < 6) {
        attempt += 1;
        await sleep(1200 * attempt);
        continue;
      }

      throw new GetApiError(`Request failed ${response.status} for ${url}: ${body.slice(0, 500)}`, response.status);
    }
  }

  private parseJson<T>(response: RequestUrlResponse): T {
    try {
      return JSON.parse(response.text) as T;
    } catch (error) {
      throw new GetApiError(`Invalid JSON response: ${(error as Error).message}`, response.status);
    }
  }

  async downloadBinary(url: string): Promise<ArrayBuffer> {
    await this.waitForTurn();
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        referer: `${BASE_URL}/note`,
        "user-agent": "Obsidian Get Notes Plugin"
      },
      throw: false
    });
    if (response.status < 200 || response.status >= 300) {
      throw new GetApiError(`Audio download failed ${response.status} for ${url}`, response.status);
    }
    return response.arrayBuffer;
  }

  async getUserInfo(): Promise<unknown> {
    return this.requestJson(`${OPENAPI_BASE_URL}/open/api/v1/resource/user/profile`);
  }

  async listNotes(sinceId = "0"): Promise<GetListResponse> {
    const search = new URLSearchParams({ since_id: String(sinceId) });
    return this.requestJson(`${OPENAPI_BASE_URL}/open/api/v1/resource/note/list?${search.toString()}`);
  }

  async getNoteDetail(noteId: string): Promise<unknown> {
    return this.requestJson(
      `${OPENAPI_BASE_URL}/open/api/v1/resource/note/detail?id=${encodeURIComponent(noteId)}&image_quality=original`
    );
  }

  async listKnowledge(page = 1): Promise<GetListResponse> {
    return this.requestJson(`${OPENAPI_BASE_URL}/open/api/v1/resource/knowledge/list?page=${page}`);
  }

  async testConnection(): Promise<void> {
    await this.getUserInfo();
  }
}
