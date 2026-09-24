import { Controller, Get, HttpException, HttpStatus, Optional } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly db?: TypeOrmHealthIndicator,
  ) {}

  /**
   * K8s Liveness Probe: 프로세스가 살아있는지 (Heap Memory 점검)
   */
  @Public()
  @Get('live')
  @HealthCheck()
  checkLiveness() {
    return this.health.check([() => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024)]);
  }

  /**
   * K8s Readiness Probe: 트래픽을 수신할 준비가 되었는지 (Redis & DB 점검)
   */
  @Public()
  @Get('ready')
  @HealthCheck()
  checkReadiness() {
    const checks: any[] = [];

    // Redis 점검 (설정되어 있는 경우)
    if (this.redisService) {
      checks.push(async () => {
        const isHealthy = await this.redisService!.ping();
        if (!isHealthy) {
          throw new HttpException({ redis: { status: 'down' } }, HttpStatus.SERVICE_UNAVAILABLE);
        }
        return { redis: { status: 'up' } };
      });
    }

    // Database 점검 (TypeORM이 설정된 서비스인 경우)
    if (this.db) {
      checks.push(() => this.db!.pingCheck('database', { timeout: 3000 }));
    }

    // 아무 의존성도 없으면 기본 UP 반환
    if (checks.length === 0) {
      checks.push(async () => ({ system: { status: 'up' } }));
    }

    return this.health.check(checks);
  }
}
