import { DistributedLockService } from './distributed-lock.service';
import { RedisService } from '../redis/redis.service';

describe('DistributedLockService - ShedLock (TDD)', () => {
  let lockService: DistributedLockService;
  let mockRedisService: jest.Mocked<Partial<RedisService>>;
  let mockRedisClient: any;

  beforeEach(() => {
    mockRedisClient = {
      set: jest.fn(),
      expire: jest.fn(),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
      del: jest.fn(),
    };

    lockService = new DistributedLockService(mockRedisService as any);
  });

  it('should acquire lock successfully when Redis SET NX returns OK', async () => {
    mockRedisClient.set.mockResolvedValue('OK');

    const acquired = await lockService.acquireLock('test-lock', 30);
    expect(acquired).toBe(true);
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'shedlock:test-lock',
      expect.any(String),
      'EX',
      30,
      'NX',
    );
  });

  it('should fail to acquire lock when Redis SET NX returns null (already held)', async () => {
    mockRedisClient.set.mockResolvedValue(null);

    const acquired = await lockService.acquireLock('test-lock', 30);
    expect(acquired).toBe(false);
  });

  it('should execute task and release lock in withLock', async () => {
    mockRedisClient.set.mockResolvedValue('OK');
    const mockTask = jest.fn().mockResolvedValue('task-result');

    const result = await lockService.withLock('my-job', mockTask, {
      lockAtMostSeconds: 60,
    });

    expect(result).toBe('task-result');
    expect(mockTask).toHaveBeenCalledTimes(1);
    expect(mockRedisService.del).toHaveBeenCalledWith('shedlock:my-job');
  });

  it('should skip task and return null if lock cannot be acquired', async () => {
    mockRedisClient.set.mockResolvedValue(null); // 다른 파드가 선점 중
    const mockTask = jest.fn();

    const result = await lockService.withLock('my-job', mockTask);

    expect(result).toBeNull();
    expect(mockTask).not.toHaveBeenCalled();
    expect(mockRedisService.del).not.toHaveBeenCalled();
  });
});
