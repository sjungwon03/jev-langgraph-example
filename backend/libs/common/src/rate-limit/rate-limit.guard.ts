import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
  RateLimitOptions,
} from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isSkipped = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isSkipped) {
      return true;
    }

    if (context.getType() !== 'http') {
      return true;
    }

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || {};

    const limit = options.limit ?? 60;
    const ttl = options.ttl ?? 60;
    const prefix = options.keyPrefix ?? 'global';

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Determine identity key (custom generator -> authenticated user id -> client IP)
    let identifier = 'anonymous';
    if (options.keyGenerator) {
      identifier = options.keyGenerator(req);
    } else if (req.user && req.user.id) {
      identifier = `user:${req.user.id}`;
    } else {
      const ip =
        req.headers['x-forwarded-for'] ||
        req.connection?.remoteAddress ||
        req.ip ||
        '127.0.0.1';
      identifier = `ip:${String(ip).split(',')[0].trim()}`;
    }

    const rateKey = `${prefix}:${identifier}`;
    const result = await this.rateLimitService.checkRateLimit(rateKey, limit, ttl);

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetSeconds.toString());
    }

    if (!result.isAllowed) {
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', result.retryAfterSeconds.toString());
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit of ${limit} requests per ${ttl} seconds exceeded. Try again in ${result.retryAfterSeconds}s.`,
          retryAfter: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
