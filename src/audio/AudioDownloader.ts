import { App } from "obsidian";
import { GetApiClient } from "../api/GetApiClient";
import { writeBinaryFile } from "../utils/path";

export class AudioDownloader {
  constructor(private app: App, private apiClient: GetApiClient) {}

  async download(url: string, targetPath: string): Promise<void> {
    const bytes = await this.apiClient.downloadBinary(url);
    await writeBinaryFile(this.app, targetPath, bytes);
  }
}
