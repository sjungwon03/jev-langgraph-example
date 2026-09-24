export interface StorageMetadata {
  contentType?: string;
  size?: number;
  customMetadata?: Record<string, string>;
  lastModified?: Date;
}

export interface UploadResult {
  key: string;
  size: number;
  contentType?: string;
  url?: string;
}

export interface DownloadResult {
  data: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageDriver {
  upload(
    key: string,
    data: Buffer,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<UploadResult>;

  download(key: string): Promise<DownloadResult>;

  delete(key: string): Promise<boolean>;

  exists(key: string): Promise<boolean>;

  getPresignedUploadUrl(key: string, expiresInSeconds?: number): Promise<string>;

  getPresignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export interface StorageModuleOptions {
  driver: 'local' | 's3';
  local?: {
    baseDir: string;
    baseUrl?: string;
  };
  s3?: {
    endpoint?: string;
    region?: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
  };
}
