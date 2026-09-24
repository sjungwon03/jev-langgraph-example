import { Injectable, Logger, INestApplication } from '@nestjs/common';

export interface ShutdownOptions {
  drainDelayMs?: number;
  timeoutMs?: number;
  onBeforeShutdown?: () => Promise<void> | void;
}

@Injectable()
export class GracefulShutdownService {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private isShuttingDown = false;
  private readonly cleanupHandlers: Array<() => Promise<void> | void> = [];

  /**
   * Registers a cleanup callback to be executed upon shutdown
   */
  registerCleanup(handler: () => Promise<void> | void): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Returns true if application is currently draining and shutting down
   */
  isDraining(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Sets up SIGTERM and SIGINT listeners on the NestJS application
   */
  setup(app: INestApplication, options: ShutdownOptions = {}): void {
    const drainDelayMs = options.drainDelayMs ?? (process.env.SHUTDOWN_DRAIN_DELAY_MS ? Number(process.env.SHUTDOWN_DRAIN_DELAY_MS) : 1000);
    const timeoutMs = options.timeoutMs ?? 15000;

    const handleSignal = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      this.logger.warn(`🛑 [GracefulShutdown] Received ${signal}. Starting graceful shutdown sequence...`);

      // 1. Drain delay: give K8s Ingress/Service endpoints time to remove this pod
      if (drainDelayMs > 0) {
        this.logger.log(`⏳ [GracefulShutdown] Waiting ${drainDelayMs}ms for ingress traffic draining...`);
        await new Promise((resolve) => setTimeout(resolve, drainDelayMs));
      }

      // 2. Execute onBeforeShutdown hook if provided
      if (options.onBeforeShutdown) {
        try {
          await options.onBeforeShutdown();
        } catch (err: any) {
          this.logger.error(`Error in onBeforeShutdown hook: ${err.message}`);
        }
      }

      // 3. Execute registered cleanup handlers (DB pools, RMQ consumers, Redis)
      for (const handler of this.cleanupHandlers) {
        try {
          await handler();
        } catch (err: any) {
          this.logger.error(`Error during cleanup handler: ${err.message}`);
        }
      }

      // 4. Force exit timeout safety timer
      const forceExitTimer = setTimeout(() => {
        this.logger.error(`⚠️ [GracefulShutdown] Timeout of ${timeoutMs}ms exceeded. Forcing exit.`);
        process.exit(1);
      }, timeoutMs);

      // 5. Close NestJS app
      try {
        await app.close();
        this.logger.log(`✅ [GracefulShutdown] Application closed gracefully.`);
      } catch (err: any) {
        this.logger.error(`Error closing NestJS application: ${err.message}`);
      } finally {
        clearTimeout(forceExitTimer);
      }
    };

    process.once('SIGTERM', () => handleSignal('SIGTERM'));
    process.once('SIGINT', () => handleSignal('SIGINT'));
  }

  /**
   * Triggers programmatic shutdown (useful for tests)
   */
  async triggerShutdown(): Promise<void> {
    this.isShuttingDown = true;
    for (const handler of this.cleanupHandlers) {
      await handler();
    }
  }
}
