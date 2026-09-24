import { HttpException, HttpStatus } from '@nestjs/common';
import { BrokenCircuitError } from 'cockatiel';
import { isFaultError, ResilienceService } from './resilience.service';

describe('ResilienceService & isFaultError (TDD)', () => {
  describe('isFaultError', () => {
    it('should return false for 4xx client errors (ignoreExceptions)', () => {
      expect(isFaultError(new HttpException('Not Found', HttpStatus.NOT_FOUND))).toBe(false);
      expect(isFaultError(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED))).toBe(false);
      expect(isFaultError(new HttpException('Conflict', HttpStatus.CONFLICT))).toBe(false);
      expect(isFaultError({ status: 400 })).toBe(false);
      expect(isFaultError({ statusCode: 422 })).toBe(false);
      expect(isFaultError({ response: { status: 403 } })).toBe(false);
    });

    it('should return false for RPC message-based client errors', () => {
      expect(isFaultError(new Error('Invalid email or password'))).toBe(false);
      expect(isFaultError(new Error('User already exists'))).toBe(false);
      expect(isFaultError(new Error('Resource not found'))).toBe(false);
    });

    it('should return true for 5xx server errors and system faults', () => {
      expect(isFaultError(new HttpException('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR))).toBe(true);
      expect(isFaultError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isFaultError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isFaultError({ status: 503 })).toBe(true);
    });
  });

  describe('ResilienceService.execute', () => {
    let service: ResilienceService;

    beforeEach(() => {
      service = new ResilienceService();
    });

    it('should execute action successfully and return result', async () => {
      const action = jest.fn().mockResolvedValue('success-data');

      const result = await service.execute('test-pipeline-1', action);
      expect(result).toBe('success-data');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger fallback on 4xx client errors and rethrow immediately', async () => {
      const clientError = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
      const action = jest.fn().mockRejectedValue(clientError);
      const fallback = jest.fn().mockResolvedValue('fallback-value');

      await expect(
        service.execute('test-pipeline-2', action, fallback, { retryAttempts: 1 }),
      ).rejects.toThrow(clientError);

      expect(action).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should trigger fallback when server fault occurs', async () => {
      const serverError = new Error('Database connection failed');
      const action = jest.fn().mockRejectedValue(serverError);
      const fallback = jest.fn().mockResolvedValue('fallback-data');

      const result = await service.execute(
        'test-pipeline-3',
        action,
        fallback,
        { retryAttempts: 1, timeoutMs: 1000 },
      );

      expect(result).toBe('fallback-data');
      expect(fallback).toHaveBeenCalledWith(serverError);
    });

    it('should open circuit breaker after consecutive failures and fast-fail', async () => {
      const serverError = new Error('Downstream unavailable');
      const action = jest.fn().mockRejectedValue(serverError);

      const options = { failureThreshold: 2, retryAttempts: 0, timeoutMs: 1000 };

      // 1st failure
      await expect(service.execute('test-cb', action, undefined, options)).rejects.toThrow(serverError);
      // 2nd failure -> trips circuit
      await expect(service.execute('test-cb', action, undefined, options)).rejects.toThrow(serverError);

      // 3rd call should fast-fail with BrokenCircuitError
      await expect(service.execute('test-cb', action, undefined, options)).rejects.toThrow(
        BrokenCircuitError,
      );

      const statusList = service.getStatusList();
      const cbStatus = statusList.find((s) => s.name === 'test-cb');
      expect(cbStatus).toBeDefined();
      expect(cbStatus?.state).toBe('OPEN');
      expect(cbStatus?.stateCode).toBe(2);
    });
  });
});
