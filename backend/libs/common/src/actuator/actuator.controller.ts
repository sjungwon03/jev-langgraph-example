import { Body, Controller, Get, Optional, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DynamicConfigService } from '../config/dynamic-config.service';
import { MetricsService } from '../metrics/metrics.service';
import { RedisService } from '../redis/redis.service';
import { ResilienceService } from '../resilience/resilience.service';

@Controller('actuator')
export class ActuatorController {
  constructor(
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly resilienceService?: ResilienceService,
    @Optional() private readonly configService?: DynamicConfigService,
  ) {}

  /**
   * Spring Boot Actuator 인덱스
   */
  @Public()
  @Get()
  index() {
    return {
      _links: {
        self: { href: '/actuator' },
        health: { href: '/actuator/health' },
        info: { href: '/actuator/info' },
        metrics: { href: '/actuator/metrics' },
        resilience: { href: '/actuator/resilience' },
        config: { href: '/actuator/config' },
        env: { href: '/actuator/env' },
        refresh: { href: '/actuator/refresh' },
      },
    };
  }

  /**
   * Spring Boot Actuator Info 엔드포인트
   */
  @Public()
  @Get('info')
  getInfo() {
    return {
      app: {
        name: process.env.npm_package_name || 'nest-msa',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      memory: {
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Spring Boot Actuator Health 표준 스펙
   */
  @Public()
  @Get('health')
  async getHealth() {
    const components: Record<string, any> = {
      process: {
        status: 'UP',
        details: {
          uptimeSeconds: Math.floor(process.uptime()),
        },
      },
    };

    let overallStatus = 'UP';

    // Redis 점검
    if (this.redisService) {
      const isRedisUp = await this.redisService.ping();
      components.redis = {
        status: isRedisUp ? 'UP' : 'DOWN',
      };
      if (!isRedisUp) overallStatus = 'DOWN';
    }

    return {
      status: overallStatus,
      components,
    };
  }

  /**
   * Spring Boot Actuator Metrics 엔드포인트
   */
  @Public()
  @Get('metrics')
  async getMetrics() {
    if (this.metricsService) {
      return this.metricsService.getMetrics();
    }
    return { message: 'MetricsModule not registered' };
  }

  /**
   * 서킷 브레이커 현황
   */
  @Public()
  @Get('resilience')
  getResilience() {
    return this.resilienceService?.getStatusList() || [];
  }

  /**
   * 동적 설정 조회 엔드포인트
   */
  @Public()
  @Get('config')
  getConfig() {
    return this.configService?.getAll(true) || {};
  }

  /**
   * Spring Boot Actuator Env 엔드포인트 (K8s ConfigMap, Secret, OS 환경변수 조회)
   */
  @Public()
  @Get('env')
  getEnv() {
    return {
      activeProfiles: [process.env.NODE_ENV || 'development'],
      propertySources: [
        {
          name: 'systemEnvironment',
          properties: {
            NODE_ENV: { value: process.env.NODE_ENV || 'development' },
            PORT: { value: process.env.PORT || 'unknown' },
          },
        },
        {
          name: 'k8sConfiguration',
          properties: this.configService?.getAll(true) || {},
        },
      ],
    };
  }

  /**
   * Spring Cloud Bus 스타일 무중단 동적 설정 갱신 엔드포인트
   */
  @Public()
  @Post('refresh')
  async refreshConfig(@Body() body: any) {
    if (this.configService) {
      const refreshedKeys = await this.configService.refresh(body || {});
      return {
        refreshedKeys,
        timestamp: new Date().toISOString(),
      };
    }
    return { refreshedKeys: [] };
  }
}
