import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, IS_PUBLIC_KEY, Role } from './rbac.constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<(Role | string)[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    let user: any;
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest();
      user = req.user;
    } else if (context.getType() === 'rpc') {
      const data = context.switchToRpc().getData();
      user = data?.user;
    }

    if (!user) {
      throw new ForbiddenException('Access denied: Authentication required for protected role');
    }

    const userRoles: string[] = Array.isArray(user.roles)
      ? user.roles
      : user.role
      ? [user.role]
      : [];

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied: Required one of roles [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
