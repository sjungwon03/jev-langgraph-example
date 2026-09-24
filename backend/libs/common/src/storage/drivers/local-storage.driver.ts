import * as fs from 'fs';
import * as path from 'path';
import { StorageDriver, UploadResult, DownloadResult } from '../storage.interface';

export class LocalStorageDriver implements StorageDriver {
  private readonly baseDir: string;
  private readonly baseUrl: string;

  constructor(options?: { baseDir?: string; baseUrl?: string }) {
    this.baseDir = options?.baseDir || path.join(process.cwd(), 'uploads');
    this.baseUrl = options?.baseUrl || 'http://localhost:3000/uploads';

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    const safeKey = key.replace(/\.\./g, '');
    return path.join(this.baseDir, safeKey);
  }

  async upload(
    key: string,
    data: Buffer,
    contentType = 'application/octet-stream',
    metadata?: Record<string, string>,
  ): Promise<UploadResult> {
    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, data);

    return {
      key,
      size: data.length,
      contentType,
      url: `${this.baseUrl}/${key}`,
    };
  }

  async download(key: string): Promise<DownloadResult> {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object not found in local storage: ${key}`);
    }

    const data = await fs.promises.readFile(filePath);
    return {
      data,
      contentType: 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return fs.existsSync(filePath);
  }

  async getPresignedUploadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return `${this.baseUrl}/${key}?action=upload&expires=${Date.now() + expiresInSeconds * 1000}`;
  }

  async getPresignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return `${this.baseUrl}/${key}?action=download&expires=${Date.now() + expiresInSeconds * 1000}`;
  }
}
