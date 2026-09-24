import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';

describe('StorageModule', () => {
  const testDir = path.join(process.cwd(), 'tmp-test-uploads');
  let storageService: StorageService;

  beforeEach(() => {
    storageService = new StorageService({
      driver: 'local',
      local: { baseDir: testDir, baseUrl: 'http://localhost:3000/files' },
    });
  });

  afterEach(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should upload a file and return correct url and metadata', async () => {
    const payload = Buffer.from('hello-msa-cloud');
    const result = await storageService.upload('test/hello.txt', payload, 'text/plain');

    expect(result.key).toBe('test/hello.txt');
    expect(result.size).toBe(payload.length);
    expect(result.url).toBe('http://localhost:3000/files/test/hello.txt');
    expect(await storageService.exists('test/hello.txt')).toBe(true);
  });

  it('should download uploaded file content', async () => {
    const payload = Buffer.from('download-content');
    await storageService.upload('docs/readme.txt', payload);

    const download = await storageService.download('docs/readme.txt');
    expect(download.data.toString()).toBe('download-content');
  });

  it('should delete an existing file and report false on non-existent', async () => {
    await storageService.upload('temp.dat', Buffer.from('123'));
    expect(await storageService.exists('temp.dat')).toBe(true);

    const deleted = await storageService.delete('temp.dat');
    expect(deleted).toBe(true);
    expect(await storageService.exists('temp.dat')).toBe(false);

    const deleteAgain = await storageService.delete('temp.dat');
    expect(deleteAgain).toBe(false);
  });

  it('should generate valid presigned upload and download URLs', async () => {
    const uploadUrl = await storageService.getPresignedUploadUrl('avatar.png', 1800);
    expect(uploadUrl).toContain('action=upload');
    expect(uploadUrl).toContain('avatar.png');

    const downloadUrl = await storageService.getPresignedDownloadUrl('avatar.png', 1800);
    expect(downloadUrl).toContain('action=download');
    expect(downloadUrl).toContain('avatar.png');
  });
});
