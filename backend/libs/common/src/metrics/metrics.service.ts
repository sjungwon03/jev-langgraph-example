import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;
  public readonly httpRequestCounter: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;
  public readonly circuitBreakerGauge: Gauge<string>;
  public readonly notificationSentCounter: Counter<string>;
  public readonly notificationDuration: Histogram<string>;

  constructor() {
    this.registry = new Registry();

    // Node.js 시스템 기본 메트릭 (Heap, CPU, GC, Event Loop Lag 등) 수집
    collectDefaultMetrics({ register: this.registry });

    // HTTP 요청 수 메트릭
    this.httpRequestCounter = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests processed',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    // HTTP 요청 지연 시간 메트릭 (초 단위 버킷)
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // 서킷 브레이커 상태 메트릭 (0: Closed, 1: Half-Open, 2: Open)
    this.circuitBreakerGauge = new Gauge({
      name: 'circuit_breaker_state',
      help: 'State of Circuit Breaker (0: Closed, 1: Half-Open, 2: Open)',
      labelNames: ['name'],
      registers: [this.registry],
    });

    // 알림 발송 건수 메트릭 (채널별, 상태별)
    this.notificationSentCounter = new Counter({
      name: 'notification_sent_total',
      help: 'Total number of notifications processed',
      labelNames: ['channel', 'status'],
      registers: [this.registry],
    });

    // 알림 발송 소요 시간 메트릭
    this.notificationDuration = new Histogram({
      name: 'notification_duration_seconds',
      help: 'Duration of notification delivery in seconds',
      labelNames: ['channel', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  recordNotification(channel: string, status: string, durationSeconds?: number) {
    this.notificationSentCounter.inc({ channel, status });
    if (typeof durationSeconds === 'number') {
      this.notificationDuration.observe({ channel, status }, durationSeconds);
    }
  }

  onModuleInit() {
    // 초기화 시점 로직
  }

  setCircuitBreakerState(name: string, state: number) {
    this.circuitBreakerGauge.set({ name }, state);
  }

  getRegistry(): Registry {
    return this.registry;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
