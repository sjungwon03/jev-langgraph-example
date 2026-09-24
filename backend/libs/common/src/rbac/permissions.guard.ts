import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, IS_PUBLIC_KEY, Permission, Role } from './rbac.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<(Permission | string)[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
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
      throw new ForbiddenException('Access denied: Authentication required for protected permission');
    }

    // ADMIN role automatically possesses all permissions (Superuser bypass)
    const userRoles: string[] = Array.isArray(user.roles)
      ? user.roles
      : user.role
      ? [user.role]
      : [];

    if (userRoles.includes(Role.ADMIN)) {
      return true;
    }

    const userPermissions: string[] = Array.isArray(user.permissions)
      ? user.permissions
      : [];

    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Access denied: Missing required permissions [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
