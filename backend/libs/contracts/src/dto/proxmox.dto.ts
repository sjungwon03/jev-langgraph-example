import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum VmActionType {
  START = 'start',
  SHUTDOWN = 'shutdown',
  STOP = 'stop',
  REBOOT = 'reboot',
  FORCE_STOP = 'force_stop',
  DELETE = 'delete',
}

export enum TargetKind {
  QEMU = 'qemu',
  LXC = 'lxc',
  NODE = 'node',
  STORAGE = 'storage',
}

export class VmActionRequestDto {
  @IsString()
  node!: string;

  @IsNumber()
  vmid!: number;

  @IsEnum(VmActionType)
  action!: VmActionType;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export interface ProxmoxNodeDto {
  node: string;
  status: 'online' | 'offline';
  cpu: number; // 0.0 - 1.0
  maxcpu: number;
  mem: number; // bytes
  maxmem: number; // bytes
  disk: number; // bytes
  maxdisk: number; // bytes
  uptime: number; // seconds
  level?: string;
  id?: string;
}

export interface ProxmoxVmDto {
  vmid: number;
  name: string;
  node: string;
  status: 'running' | 'stopped' | 'paused';
  type: 'qemu' | 'lxc';
  cpu: number;
  cpus: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
}

export interface ProxmoxStorageDto {
  storage: string;
  node: string;
  type: string;
  content: string;
  active: number;
  enabled: number;
  used: number;
  total: number;
  avail: number;
}

export interface TaskReceiptDto {
  upid: string;
  targetKind: TargetKind;
  node: string;
  vmid: number;
  summary?: string;
}

export interface ClusterSummaryDto {
  version: string;
  nodes: ProxmoxNodeDto[];
  vms: ProxmoxVmDto[];
  storage: ProxmoxStorageDto[];
  totalCpuUsage: number;
  totalMemUsage: number;
  totalDiskUsage: number;
}

export class CreateVmDto {
  @IsString()
  node!: string;

  @IsNumber()
  vmid!: number;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  type?: 'qemu' | 'lxc';

  @IsNumber()
  @IsOptional()
  cpus?: number;

  @IsNumber()
  @IsOptional()
  memory?: number; // in MB

  @IsNumber()
  @IsOptional()
  diskSize?: number; // in GB

  @IsString()
  @IsOptional()
  osTemplate?: string;
}

export class VmSnapshotDto {
  @IsString()
  node!: string;

  @IsNumber()
  vmid!: number;

  @IsString()
  snapname!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  vmstate?: boolean;
}

export class VmResizeDiskDto {
  @IsString()
  node!: string;

  @IsNumber()
  vmid!: number;

  @IsString()
  disk!: string; // e.g. "scsi0"

  @IsString()
  size!: string; // e.g. "+10G"
}

export interface VmSnapshotRecord {
  name: string;
  snaptime: number;
  description?: string;
  vmstate?: number;
}

