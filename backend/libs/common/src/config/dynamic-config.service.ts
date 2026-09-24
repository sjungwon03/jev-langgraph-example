import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';
import { AppLogger } from '../logger/app-logger.service';
import { RedisService } from '../redis/redis.service';

export const CONFIG_BUS_CHANNEL = 'spring_cloud_bus:config_refresh';

export interface DynamicConfigs {
  maintenanceMode: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeoutMs: number;
  rateLimitPerMinute: number;
  [key: string]: any;
}

/**
 * Spring Cloud Config & K8s Native (ConfigMap & Secret) 무중단 동적 설정 갱신 서비스
 *
 * 1. Kubernetes ConfigMap (/etc/config) 및 Secret (/etc/secrets) 볼륨 마운트 디렉토리 탐색 및 파싱
 * 2. K8s ConfigMap 변경(심볼릭 링크 교체) 시 fs.watch 기반 Pod 무중단 핫리로드
 * 3. Redis Pub/Sub 기반 분산 파드 동적 설정 동기화 (Spring Cloud Bus @RefreshScope)
 * 4. 계층적 우선순위 해석: Process ENV > K8s Secret > K8s ConfigMap > Dynamic Redis > Defaults
 */
@Injectable()
export class DynamicConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger(DynamicConfigService.name);
  private subscriberClient: Redis | null = null;
  private configWatcher: fs.FSWatcher | null = null;
  private secretWatcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  // K8s 볼륨 마운트 설정 캐시
  private k8sConfigMap: Record<string, any> = {};
  private k8sSecret: Record<string, any> = {};

  // 인메모리 기본 및 동적 설정 저장소
  private configs: DynamicConfigs = {
    maintenanceMode: false,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeoutMs: 3000,
    rateLimitPerMinute: 100,
  };

  private readonly configDir = process.env.K8S_CONFIG_DIR || '/etc/config';
  private readonly secretDir = process.env.K8S_SECRET_DIR || '/etc/secrets';

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    // 1. Kubernetes ConfigMap & Secret 마운트 경로 1차 로드
    this.reloadK8sConfigs(false);

    // 2. K8s ConfigMap & Secret 디렉토리 변경 감시 (Hot-Reload Watcher) 설정
    this.setupK8sWatchers();

    // 3. Redis Pub/Sub (Spring Cloud Bus) 설정
    await this.setupRedisBus();
  }

  async onModuleDestroy() {
    if (this.configWatcher) {
      try {
        this.configWatcher.close();
      } catch (_) {}
      this.configWatcher = null;
    }
    if (this.secretWatcher) {
      try {
        this.secretWatcher.close();
      } catch (_) {}
      this.secretWatcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.subscriberClient) {
      await this.subscriberClient.quit();
      this.subscriberClient = null;
    }
  }

  /**
   * Kubernetes 마운트 디렉토리 파싱 (ConfigMap / Secret)
   */
  public loadK8sDirectory(dirPath: string): Record<string, any> {
    const result: Record<string, any> = {};
    if (!fs.existsSync(dirPath)) {
      return result;
    }

    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        // K8s 심볼릭 링크 메타데이터(..data 등) 스킵
        if (file.startsWith('..')) continue;

        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        try {
          const rawContent = fs.readFileSync(fullPath, 'utf8').trim();

          // application.json 또는 config.json 형태의 구조화된 설정 파일
          if (file === 'application.json' || file === 'config.json' || file.endsWith('.json')) {
            try {
              const parsedJson = JSON.parse(rawContent);
              Object.assign(result, parsedJson);
              continue;
            } catch (jsonErr: any) {
              this.logger.warn(`Failed to parse JSON in config file ${file}: ${jsonErr.message}`);
            }
          }

          // K8s 개별 파일 키-값 형태
          try {
            // boolean, number, array 등 형변환 시도
            result[file] = JSON.parse(rawContent);
          } catch {
            result[file] = rawContent;
          }
        } catch (readErr: any) {
          this.logger.warn(`Error reading K8s config file ${fullPath}: ${readErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to read K8s config directory ${dirPath}: ${err.message}`);
    }

    return result;
  }

  /**
   * K8s ConfigMap 및 Secret 전체 재로드
   */
  public reloadK8sConfigs(notify = true) {
    this.k8sConfigMap = this.loadK8sDirectory(this.configDir);
    this.k8sSecret = this.loadK8sDirectory(this.secretDir);

    if (notify) {
      const cmKeys = Object.keys(this.k8sConfigMap);
      const secretKeys = Object.keys(this.k8sSecret);
      this.logger.log(
        `🔄 [K8s ConfigMap/Secret] Hot-reloaded configs: ${cmKeys.length} config keys, ${secretKeys.length} secret keys`,
      );
    }
  }

  /**
   * K8s ConfigMap/Secret 디렉토리 fs.watch 감시 설정 (Spring Cloud Kubernetes style)
   */
  private setupK8sWatchers() {
    const watchDir = (dir: string, label: string): fs.FSWatcher | null => {
      if (!fs.existsSync(dir)) return null;
      try {
        const watcher = fs.watch(dir, () => {
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.reloadK8sConfigs(true);
          }, 300);
        });
        this.logger.log(`👀 [K8s Watcher] Watching ${label} directory for hot-reload: ${dir}`);
        return watcher;
      } catch (err: any) {
        this.logger.warn(`Failed to watch ${label} directory ${dir}: ${err.message}`);
        return null;
      }
    };

    this.configWatcher = watchDir(this.configDir, 'ConfigMap');
    this.secretWatcher = watchDir(this.secretDir, 'Secret');
  }

  /**
   * Redis Pub/Sub (Spring Cloud Bus) 초기화
   */
  private async setupRedisBus() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    this.subscriberClient = new Redis({
      host,
      port,
      password,
      lazyConnect: false,
    });

    try {
      await this.subscriberClient.subscribe(CONFIG_BUS_CHANNEL);
      this.logger.log(`🚌 [Spring Cloud Bus] Subscribed to channel: ${CONFIG_BUS_CHANNEL}`);

      this.subscriberClient.on('message', (channel, message) => {
        if (channel === CONFIG_BUS_CHANNEL) {
          try {
            const payload = JSON.parse(message);
            this.applyUpdates(payload);
          } catch (err: any) {
            this.logger.error(`Failed to parse config refresh message: ${err.message}`);
          }
        }
      });

      // Redis에 영속 저장된 동적 설정 동기화
      const persisted = await this.redisService.get('config:dynamic');
      if (persisted) {
        this.applyUpdates(JSON.parse(persisted), false);
      }
    } catch (err: any) {
      this.logger.warn(`Redis Bus connection failed (running with local configs): ${err.message}`);
    }
  }

  private applyUpdates(updates: Partial<DynamicConfigs>, notify = true) {
    this.configs = {
      ...this.configs,
      ...updates,
    };
    if (notify) {
      this.logger.log(
        `🔄 [DynamicConfig] Hot reloaded configs via Spring Cloud Bus: ${JSON.stringify(updates)}`,
      );
    }
  }

  /**
   * 계층적 우선순위 설정 값 조회
   * Priority: OS Env > K8s Secret > K8s ConfigMap > Dynamic Redis > Default
   */
  get<T = any>(key: string, defaultValue?: T): T {
    // 1. OS 환경변수 (Exact Key, UPPER_SNAKE_CASE)
    const envKey = key.replace(/([A-Z])/g, '_$1').toUpperCase();
    if (process.env[key] !== undefined) {
      return this.parseValue(process.env[key]) as T;
    }
    if (process.env[envKey] !== undefined) {
      return this.parseValue(process.env[envKey]) as T;
    }

    // 2. K8s Secret
    if (this.k8sSecret[key] !== undefined) {
      return this.k8sSecret[key] as T;
    }

    // 3. K8s ConfigMap
    if (this.k8sConfigMap[key] !== undefined) {
      return this.k8sConfigMap[key] as T;
    }

    // 4. Redis / Spring Cloud Bus 동적 설정
    if (this.configs[key] !== undefined) {
      return this.configs[key] as T;
    }

    // 5. 기본값
    return defaultValue as T;
  }

  private parseValue(val: string): any {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val)) && val.trim() !== '') return Number(val);
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  /**
   * 전체 유효 설정 현황 조회 (보안 마스킹 옵션 제공)
   */
  getAll(maskSecrets = true): Record<string, any> {
    const combined: Record<string, any> = {
      ...this.configs,
      ...this.k8sConfigMap,
      ...this.k8sSecret,
    };

    if (!maskSecrets) return combined;

    const masked: Record<string, any> = {};
    const sensitivePattern = /password|secret|key|token|auth/i;

    for (const [k, v] of Object.entries(combined)) {
      if (sensitivePattern.test(k) && typeof v === 'string') {
        masked[k] = '******';
      } else {
        masked[k] = v;
      }
    }
    return masked;
  }

  /**
   * 동적 설정 갱신 및 Spring Cloud Bus 브로드캐스트 발행
   */
  async refresh(updates: Partial<DynamicConfigs>): Promise<string[]> {
    const current = { ...this.configs };
    const updated = { ...current, ...updates };

    await this.redisService.set('config:dynamic', JSON.stringify(updated));
    await this.redisService.getClient().publish(CONFIG_BUS_CHANNEL, JSON.stringify(updates));

    this.applyUpdates(updates);
    return Object.keys(updates);
  }
}
