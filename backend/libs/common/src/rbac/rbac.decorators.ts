import { SetMetadata } from '@nestjs/common';
import { Role, Permission, ROLES_KEY, PERMISSIONS_KEY } from './rbac.constants';
export { Public } from '../auth/public.decorator';

export const Roles = (...roles: (Role | string)[]) => SetMetadata(ROLES_KEY, roles);

export const Permissions = (...permissions: (Permission | string)[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
