import { BadRequestException, ConflictException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor, IDEMPOTENCY_HEADER } from './idempotency.interceptor';
import { RedisService } from '../redis/redis.service';

describe('IdempotencyInterceptor (TDD)', () => {
  let interceptor: IdempotencyInterceptor;
  let mockReflector: any;
  let mockRedisService: any;
  let mockRedisClient: any;
  let mockContext: ExecutionContext;
  let mockRequest: any;
  let mockResponse: any;
  let mockCallHandler: any;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      statusCode: 200,
      setHeader: jest.fn(),
      status: jest.fn(),
    };

    mockContext = {
      getHandler: jest.fn().mockReturnValue('mockHandler'),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ success: true, orderId: 'ord-123' })),
    };

    mockRedisClient = {
      set: jest.fn(),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    mockReflector = {
      get: jest.fn(),
    };

    interceptor = new IdempotencyInterceptor(
      mockReflector as Reflector,
      mockRedisService as RedisService,
    );
  });

  it('should pass through directly if @Idempotent decorator is not present', async () => {
    mockReflector.get.mockReturnValue(undefined);

    const result$ = await interceptor.intercept(mockContext, mockCallHandler);
    expect(mockCallHandler.handle).toHaveBeenCalled();
    expect(mockRedisService.get).not.toHaveBeenCalled();

    let data;
    result$.subscribe((val) => (data = val));
    expect(data).toEqual({ success: true, orderId: 'ord-123' });
  });

  it('should throw BadRequestException if header is missing and required: true', async () => {
    mockReflector.get.mockReturnValue({ required: true, ttlSeconds: 60 });
    mockRequest.headers = {};

    await expect(interceptor.intercept(mockContext, mockCallHandler)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should pass through if header is missing and required: false', async () => {
    mockReflector.get.mockReturnValue({ required: false });
    mockRequest.headers = {};

    const result$ = await interceptor.intercept(mockContext, mockCallHandler);
    expect(mockCallHandler.handle).toHaveBeenCalled();
    expect(mockRedisService.get).not.toHaveBeenCalled();
  });

  it('should return cached response on IDEMPOTENT_HIT if record is RESOLVED', async () => {
    mockReflector.get.mockReturnValue({ required: true });
    mockRequest.headers[IDEMPOTENCY_HEADER] = 'req-key-001';

    const cachedData = { orderId: 'cached-123' };
    mockRedisService.get.mockResolvedValue(
      JSON.stringify({
        status: 'RESOLVED',
        statusCode: 201,
        data: cachedData,
      }),
    );

    const result$ = await interceptor.intercept(mockContext, mockCallHandler);
    expect(mockCallHandler.handle).not.toHaveBeenCalled();
    expect(mockResponse.setHeader).toHaveBeenCalledWith('x-cache', 'IDEMPOTENT_HIT');
    expect(mockResponse.status).toHaveBeenCalledWith(201);

    let data;
    result$.subscribe((val) => (data = val));
    expect(data).toEqual(cachedData);
  });

  it('should throw ConflictException if key is already PENDING', async () => {
    mockReflector.get.mockReturnValue({ required: true });
    mockRequest.headers[IDEMPOTENCY_HEADER] = 'req-key-pending';

    mockRedisService.get.mockResolvedValue(
      JSON.stringify({
        status: 'PENDING',
      }),
    );

    await expect(interceptor.intercept(mockContext, mockCallHandler)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should acquire Redis lock with NX and cache resolved response on success', async () => {
    mockReflector.get.mockReturnValue({ required: true, ttlSeconds: 300 });
    mockRequest.headers[IDEMPOTENCY_HEADER] = 'req-key-new';
    mockResponse.statusCode = 201;

    mockRedisService.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK'); // NX lock acquired

    const result$ = await interceptor.intercept(mockContext, mockCallHandler);
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'idempotency:req-key-new',
      JSON.stringify({ status: 'PENDING' }),
      'EX',
      30,
      'NX',
    );

    let data;
    result$.subscribe((val) => (data = val));
    expect(data).toEqual({ success: true, orderId: 'ord-123' });

    expect(mockRedisService.set).toHaveBeenCalledWith(
      'idempotency:req-key-new',
      JSON.stringify({
        status: 'RESOLVED',
        statusCode: 201,
        data: { success: true, orderId: 'ord-123' },
      }),
      300,
    );
  });

  it('should throw ConflictException if Redis lock acquisition fails (concurrent request)', async () => {
    mockReflector.get.mockReturnValue({ required: true });
    mockRequest.headers[IDEMPOTENCY_HEADER] = 'req-key-concurrent';

    mockRedisService.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue(null); // lock failed

    await expect(interceptor.intercept(mockContext, mockCallHandler)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should delete lock key on handler error so retry is permitted', async () => {
    mockReflector.get.mockReturnValue({ required: true });
    mockRequest.headers[IDEMPOTENCY_HEADER] = 'req-key-error';

    mockRedisService.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');

    const error = new Error('Database down');
    mockCallHandler.handle.mockReturnValue(throwError(() => error));

    const result$ = await interceptor.intercept(mockContext, mockCallHandler);

    await expect(
      new Promise((resolve, reject) => {
        result$.subscribe({ next: resolve, error: reject });
      }),
    ).rejects.toThrow('Database down');

    expect(mockRedisService.del).toHaveBeenCalledWith('idempotency:req-key-error');
  });
});
