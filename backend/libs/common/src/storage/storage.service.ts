import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  StorageDriver,
  UploadResult,
  DownloadResult,
  StorageModuleOptions,
} from './storage.interface';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { S3StorageDriver } from './drivers/s3-storage.driver';

export const STORAGE_OPTIONS = 'STORAGE_OPTIONS';

@Injectable()
export class StorageService implements StorageDriver {
  private readonly logger = new Logger(StorageService.name);
  private driver: StorageDriver;

  constructor(@Inject(STORAGE_OPTIONS) private readonly options: StorageModuleOptions) {
    if (options.driver === 's3' && options.s3) {
      this.logger.log(`📦 [StorageService] Using S3 Driver (Bucket: ${options.s3.bucket})`);
      this.driver = new S3StorageDriver(options.s3);
    } else {
      this.logger.log(`📦 [StorageService] Using Local Storage Driver (Dir: ${options.local?.baseDir || 'uploads'})`);
      this.driver = new LocalStorageDriver(options.local);
    }
  }

  async upload(
    key: string,
    data: Buffer,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<UploadResult> {
    return this.driver.upload(key, data, contentType, metadata);
  }

  async download(key: string): Promise<DownloadResult> {
    return this.driver.download(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.driver.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }

  async getPresignedUploadUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.driver.getPresignedUploadUrl(key, expiresInSeconds);
  }

  async getPresignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.driver.getPresignedDownloadUrl(key, expiresInSeconds);
  }
}
