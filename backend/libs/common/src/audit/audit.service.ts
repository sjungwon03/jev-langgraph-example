import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditEvent } from './audit.interface';
import { RmqService } from '../rmq/rmq.service';

export type AuditListener = (event: AuditEvent) => void | Promise<void>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly listeners: AuditListener[] = [];
  private readonly eventBuffer: AuditEvent[] = [];

  constructor(@Optional() private readonly rmqService?: RmqService) {}

  /**
   * Dispatches an audit event asynchronously without blocking caller execution
   */
  dispatch(event: AuditEvent): void {
    // Process asynchronously on microtask queue
    setImmediate(async () => {
      try {
        this.logger.log(
          `🛡️ [AUDIT] [${event.action}] Resource: ${event.resource} | Actor: ${
            event.actor?.email || event.actor?.id || 'anonymous'
          } | Status: ${event.status} (${event.durationMs}ms)`,
        );

        // Store in buffer (last 500 events for quick in-memory inspection/health)
        if (this.eventBuffer.length >= 500) {
          this.eventBuffer.shift();
        }
        this.eventBuffer.push(event);

        // Notify in-process listeners
        for (const listener of this.listeners) {
          try {
            await listener(event);
          } catch (listenerErr: any) {
            this.logger.error(`Audit listener failed: ${listenerErr.message}`);
          }
        }
      } catch (err: any) {
        this.logger.error(`Failed to process audit event: ${err.message}`);
      }
    });
  }

  /**
   * Registers an in-memory listener
   */
  subscribe(listener: AuditListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Retrieves recent audit events
   */
  getRecentEvents(limit = 50): AuditEvent[] {
    return this.eventBuffer.slice(-limit);
  }
}
