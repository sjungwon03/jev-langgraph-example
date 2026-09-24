import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { Role, Permission, ROLES_KEY, PERMISSIONS_KEY, IS_PUBLIC_KEY } from './rbac.constants';
import { ForbiddenException } from '@nestjs/common';

describe('RbacModule', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  describe('RolesGuard', () => {
    let guard: RolesGuard;

    beforeEach(() => {
      guard = new RolesGuard(reflector);
    });

    it('should allow access to public routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return true;
        return undefined;
      });

      const mockCtx = {
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(guard.canActivate(mockCtx)).toBe(true);
    });

    it('should allow user with matching role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) return [Role.ADMIN, Role.MANAGER];
        return undefined;
      });

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.ADMIN } }),
        }),
      } as any;

      expect(guard.canActivate(mockCtx)).toBe(true);
    });

    it('should throw ForbiddenException if user lacks required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) return [Role.ADMIN];
        return undefined;
      });

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.USER } }),
        }),
      } as any;

      expect(() => guard.canActivate(mockCtx)).toThrow(ForbiddenException);
    });
  });

  describe('PermissionsGuard', () => {
    let guard: PermissionsGuard;

    beforeEach(() => {
      guard = new PermissionsGuard(reflector);
    });

    it('should allow ADMIN role to bypass permission check', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === PERMISSIONS_KEY) return [Permission.USER_DELETE];
        return undefined;
      });

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.ADMIN, permissions: [] } }),
        }),
      } as any;

      expect(guard.canActivate(mockCtx)).toBe(true);
    });

    it('should allow user possessing all required permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === PERMISSIONS_KEY) return [Permission.USER_READ, Permission.NOTIFICATION_SEND];
        return undefined;
      });

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              role: Role.USER,
              permissions: [Permission.USER_READ, Permission.NOTIFICATION_SEND],
            },
          }),
        }),
      } as any;

      expect(guard.canActivate(mockCtx)).toBe(true);
    });

    it('should throw ForbiddenException if missing permission', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === PERMISSIONS_KEY) return [Permission.USER_DELETE];
        return undefined;
      });

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: Role.USER, permissions: [Permission.USER_READ] },
          }),
        }),
      } as any;

      expect(() => guard.canActivate(mockCtx)).toThrow(ForbiddenException);
    });
  });
});
