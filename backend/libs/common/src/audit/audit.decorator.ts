import { SetMetadata } from '@nestjs/common';
import { AuditOptions } from './audit.interface';

export const AUDIT_METADATA_KEY = 'AUDIT_METADATA_KEY';

export const Audit = (options: AuditOptions) => SetMetadata(AUDIT_METADATA_KEY, options);
