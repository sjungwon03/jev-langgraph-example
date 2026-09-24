import { StorageDriver, UploadResult, DownloadResult, StorageModuleOptions } from '../storage.interface';

export class S3StorageDriver implements StorageDriver {
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;

  constructor(private readonly options: NonNullable<StorageModuleOptions['s3']>) {
    this.bucket = options.bucket;
    this.region = options.region || 'us-east-1';
    this.endpoint = options.endpoint || `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  async upload(
    key: string,
    data: Buffer,
    contentType = 'application/octet-stream',
    metadata?: Record<string, string>,
  ): Promise<UploadResult> {
    const url = `${this.endpoint}/${this.bucket}/${key}`;
    return {
      key,
      size: data.length,
      contentType,
      url,
    };
  }

  async download(key: string): Promise<DownloadResult> {
    // S3 mock/buffer download
    return {
      data: Buffer.from(`mock-s3-content-for-${key}`),
      contentType: 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<boolean> {
    return true;
  }

  async exists(key: string): Promise<boolean> {
    return true;
  }

  async getPresignedUploadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${this.endpoint}/${this.bucket}/${key}?X-Amz-Expires=${expires}&X-Amz-Signature=mock`;
  }

  async getPresignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${this.endpoint}/${this.bucket}/${key}?X-Amz-Expires=${expires}&X-Amz-Signature=mock`;
  }
}
