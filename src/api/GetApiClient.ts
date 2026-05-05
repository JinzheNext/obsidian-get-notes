import { GetApiError } from "./errors";
import { GetListResponse } from "./types";
import { debugLog } from "../utils/logger";

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

  private async requestText(url: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
    debugLog("api request", url);
    const response = await fetch(url, {
      method: "GET",
      headers
    });
    debugLog("api response", url, response.status);

    return {
      status: response.status,
      text: await response.text()
    };
  }

  private async requestJson<T = unknown>(url: string): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.waitForTurn();
      const response = await this.requestText(url, this.headers);
      if (response.status >= 200 && response.status < 300) {
        return this.parseJson<T>(response.text, response.status);
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

  private parseJson<T>(text: string, status: number): T {
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new GetApiError(`Invalid JSON response: ${(error as Error).message}`, status);
    }
  }

  async downloadBinary(url: string): Promise<ArrayBuffer> {
    await this.waitForTurn();
    debugLog("audio download request", url);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "Obsidian Get Notes Plugin"
      }
    });
    debugLog("audio download response", url, response.status);
    if (!response.ok) {
      throw new GetApiError(`Audio download failed ${response.status} for ${url}`, response.status);
    }
    return response.arrayBuffer();
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
    await this.listNotes("0");
  }
}
