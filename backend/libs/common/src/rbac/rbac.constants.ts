export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

export enum Permission {
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  NOTIFICATION_SEND = 'notification:send',
  CONFIG_MANAGE = 'config:manage',
  AUDIT_READ = 'audit:read',
}

export { IS_PUBLIC_KEY } from '../auth/public.decorator';

export const ROLES_KEY = 'ROLES_KEY';
export const PERMISSIONS_KEY = 'PERMISSIONS_KEY';
