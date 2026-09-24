import { GracefulShutdownService } from './graceful-shutdown.service';

describe('ShutdownModule', () => {
  let service: GracefulShutdownService;

  beforeEach(() => {
    service = new GracefulShutdownService();
  });

  it('should register and execute cleanup handlers in order upon shutdown', async () => {
    const executed: string[] = [];

    service.registerCleanup(async () => {
      executed.push('close_rmq_consumers');
    });

    service.registerCleanup(async () => {
      executed.push('close_db_pools');
    });

    expect(service.isDraining()).toBe(false);

    await service.triggerShutdown();

    expect(service.isDraining()).toBe(true);
    expect(executed).toEqual(['close_rmq_consumers', 'close_db_pools']);
  });
});
