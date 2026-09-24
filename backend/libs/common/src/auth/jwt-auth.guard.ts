import { ExecutionContext, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly redisService?: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 1. Passport JWT 기본 검증
    const can = (await super.canActivate(context)) as boolean;
    if (!can) return false;

    // 2. Redis 토큰 블랙리스트(로그아웃) 여부 검사
    if (this.redisService) {
      const request = context.switchToHttp().getRequest<Request>();
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const isBlacklisted = await this.redisService.isTokenBlacklisted(token);
        if (isBlacklisted) {
          throw new UnauthorizedException('Token has been revoked (logged out)');
        }
      }
    }

    return true;
  }

  handleRequest(err: any, user: any, _info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication token is missing or invalid');
    }
    return user;
  }
}
