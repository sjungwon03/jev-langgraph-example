import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export enum AutomationTriggerType {
  RESOURCE_THRESHOLD = 'RESOURCE_THRESHOLD', // e.g. Node memory > 90%
  VM_STATUS_CHANGE = 'VM_STATUS_CHANGE',       // e.g. VM unexpectedly stopped
  SCHEDULED_CRON = 'SCHEDULED_CRON',           // e.g. every night at 02:00
}

export enum AutomationActionType {
  ALERT = 'ALERT',
  AUTO_HEAL_RESTART = 'AUTO_HEAL_RESTART',
  SCALE_OR_CLEANUP = 'SCALE_OR_CLEANUP',
  CUSTOM_LANGGRAPH_PROMPT = 'CUSTOM_LANGGRAPH_PROMPT',
}

export class CreateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  triggerType!: AutomationTriggerType;

  @IsOptional()
  thresholdMetric?: 'cpu' | 'mem' | 'disk';

  @IsOptional()
  @IsNumber()
  thresholdValue?: number; // e.g. 85 (%)

  @IsOptional()
  @IsString()
  cronExpression?: string; // e.g. "0 2 * * *"

  @IsOptional()
  @IsNumber()
  targetVmid?: number;

  @IsOptional()
  @IsString()
  targetNode?: string;

  @IsString()
  actionType!: AutomationActionType;

  @IsOptional()
  @IsString()
  customPrompt?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export interface AutomationRuleRecord extends CreateAutomationRuleDto {
  id: string;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  triggerCount: number;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  actor: string; // 'user' | 'automation-engine' | 'ai-agent'
  action: string;
  targetKind: string;
  targetId: string;
  status: 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WAITING_CONFIRMATION';
  details?: Record<string, any>;
}
