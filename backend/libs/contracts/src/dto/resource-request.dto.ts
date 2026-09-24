import { IsOptional, IsString } from 'class-validator';

export type UserRole = 'DEV_TEAM' | 'INFRA_TEAM';

export type ResourceRequestType = 'CREATE_VM' | 'RESIZE_DISK' | 'RESOURCE_CHANGE' | 'DELETE_VM';

export type ResourceRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROVISIONED';

export interface ResourceSpec {
  vmid?: number;
  name?: string;
  node?: string;
  type?: 'qemu' | 'lxc';
  cores?: number;
  memory?: number; // GB or MB
  disk?: number | string; // GB e.g. 32 or +10G
  os?: string; // Ubuntu 24.04, Debian 12, Rocky Linux 9, etc.
}

export class CreateResourceRequestDto {
  @IsString()
  title!: string;

  @IsString()
  requesterName!: string;

  @IsString()
  department!: string;

  @IsString()
  type!: ResourceRequestType;

  @IsString()
  reason!: string;

  @IsOptional()
  spec?: ResourceSpec;

  @IsOptional()
  @IsString()
  dueDate?: string;
}

export class ReviewResourceRequestDto {
  @IsString()
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  reviewerComment?: string;

  @IsOptional()
  @IsString()
  targetNode?: string;
}

export interface ResourceRequestDto {
  id: string; // e.g. "REQ-1001"
  title: string;
  requesterName: string;
  department: string;
  type: ResourceRequestType;
  reason: string;
  spec: ResourceSpec;
  status: ResourceRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewerName?: string;
  reviewerComment?: string;
  targetNode?: string;
  provisionedVmid?: number;
  upid?: string;
}
