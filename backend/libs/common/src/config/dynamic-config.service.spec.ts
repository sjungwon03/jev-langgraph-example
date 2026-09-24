import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DynamicConfigService } from './dynamic-config.service';

describe('DynamicConfigService (K8s ConfigMap & Secret Integration)', () => {
  let service: DynamicConfigService;
  let tempConfigDir: string;
  let tempSecretDir: string;
  let mockRedisService: any;

  beforeEach(() => {
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-config-'));
    tempSecretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-secret-'));

    process.env.K8S_CONFIG_DIR = tempConfigDir;
    process.env.K8S_SECRET_DIR = tempSecretDir;

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      getClient: jest.fn().mockReturnValue({
        publish: jest.fn().mockResolvedValue(1),
      }),
    };

    service = new DynamicConfigService(mockRedisService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    try {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      fs.rmSync(tempSecretDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('should parse application.json and individual files from K8s ConfigMap directory', () => {
    // 1. application.json
    fs.writeFileSync(
      path.join(tempConfigDir, 'application.json'),
      JSON.stringify({
        maintenanceMode: true,
        circuitBreakerThreshold: 10,
        appName: 'TestMSA',
      }),
    );

    // 2. Individual key files (Kubernetes standard mount)
    fs.writeFileSync(path.join(tempConfigDir, 'rateLimitPerMinute'), '250');
    fs.writeFileSync(path.join(tempConfigDir, 'customFlag'), 'enabled');
    // Simulated K8s internal metadata symlink (should be skipped)
    fs.writeFileSync(path.join(tempConfigDir, '..data'), 'meta');

    const result = service.loadK8sDirectory(tempConfigDir);

    expect(result.maintenanceMode).toBe(true);
    expect(result.circuitBreakerThreshold).toBe(10);
    expect(result.appName).toBe('TestMSA');
    expect(result.rateLimitPerMinute).toBe(250);
    expect(result.customFlag).toBe('enabled');
    expect(result['..data']).toBeUndefined();
  });

  it('should parse K8s Secret directory and respect priority (Secret > ConfigMap > Defaults)', () => {
    // ConfigMap has DB_USER
    fs.writeFileSync(path.join(tempConfigDir, 'DB_USER'), 'cm_user');
    fs.writeFileSync(path.join(tempConfigDir, 'DB_PASSWORD'), 'cm_val_mock');

    // Secret overrides DB_PASSWORD
    fs.writeFileSync(path.join(tempSecretDir, 'DB_PASSWORD'), 'sec_val_mock_override');
    fs.writeFileSync(path.join(tempSecretDir, 'JWT_SECRET'), 'jwt_val_mock_override');

    service.reloadK8sConfigs(false);

    expect(service.get('DB_USER')).toBe('cm_user');
    // Secret overrides ConfigMap
    expect(service.get('DB_PASSWORD')).toBe('sec_val_mock_override');
    expect(service.get('JWT_SECRET')).toBe('jwt_val_mock_override');
  });

  it('should prioritize OS process.env over K8s Secret and ConfigMap', () => {
    fs.writeFileSync(path.join(tempSecretDir, 'DATABASE_NAME'), 'k8s_secret_db');
    process.env.DATABASE_NAME = 'env_override_db';

    service.reloadK8sConfigs(false);

    expect(service.get('DATABASE_NAME')).toBe('env_override_db');

    delete process.env.DATABASE_NAME;
  });

  it('should mask sensitive keys when calling getAll(true)', () => {
    fs.writeFileSync(path.join(tempConfigDir, 'publicHost'), 'localhost');
    fs.writeFileSync(path.join(tempSecretDir, 'dbPassword'), 'mock_masked_val_1');
    fs.writeFileSync(path.join(tempSecretDir, 'apiKey'), 'mock_masked_val_2');

    service.reloadK8sConfigs(false);

    const allMasked = service.getAll(true);
    expect(allMasked.publicHost).toBe('localhost');
    expect(allMasked.dbPassword).toBe('******');
    expect(allMasked.apiKey).toBe('******');

    const allUnmasked = service.getAll(false);
    expect(allUnmasked.dbPassword).toBe('mock_masked_val_1');
    expect(allUnmasked.apiKey).toBe('mock_masked_val_2');
  });

  it('should hot-reload configuration on file change in K8s directory', async () => {
    fs.writeFileSync(path.join(tempConfigDir, 'dynamicValue'), 'initial');
    service.reloadK8sConfigs(false);
    expect(service.get('dynamicValue')).toBe('initial');

    // Update file
    fs.writeFileSync(path.join(tempConfigDir, 'dynamicValue'), 'hot_reloaded_value');
    service.reloadK8sConfigs(false);
    expect(service.get('dynamicValue')).toBe('hot_reloaded_value');
  });
});
