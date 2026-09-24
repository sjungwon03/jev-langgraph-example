import { Module, Global } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [RolesGuard, PermissionsGuard],
  exports: [RolesGuard, PermissionsGuard],
})
export class RbacModule {}
