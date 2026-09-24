import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChatMessageInputDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsOptional()
  threadId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  role?: 'DEV_TEAM' | 'INFRA_TEAM';

  @IsString()
  @IsOptional()
  requesterName?: string;
}

export class ConfirmActionDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsBoolean()
  approved!: boolean;
}

export type StreamChunkType =
  | 'thought'
  | 'decision'
  | 'tool_start'
  | 'tool_end'
  | 'confirmation_required'
  | 'content'
  | 'error'
  | 'done';

export interface AgentStreamChunk {
  type: StreamChunkType;
  content?: string;
  tool?: string;
  input?: any;
  output?: any;
  decision?: {
    intent: string;
    tool?: string;
    why: string;
    safetyEvaluation?: string;
    args?: Record<string, any>;
    latencyMs?: number;
  };
  confirmation?: {
    token: string;
    action: string;
    node: string;
    vmid: number;
    description: string;
    expiresAt: string;
  };
  error?: string;
  threadId?: string;
}

export interface ChatThreadHistoryDto {
  threadId: string;
  messages: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    toolCalls?: any[];
  }[];
}
