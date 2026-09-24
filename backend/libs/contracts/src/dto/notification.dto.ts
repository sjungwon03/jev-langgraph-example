import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  @IsNotEmpty()
  to: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  template?: 'welcome' | 'password_reset' | 'security_alert' | string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  html?: string;
}

export class SendPushDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tokens?: string[];

  @IsOptional()
  @IsString()
  topic?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, string>;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsString()
  sender?: string;
}

export type NotificationChannelType = 'email' | 'push' | 'sms' | 'all';

export class SendNotificationDto {
  @IsEnum(['email', 'push', 'sms', 'all'])
  @IsNotEmpty()
  channel: NotificationChannelType;

  @IsOptional()
  email?: SendEmailDto;

  @IsOptional()
  push?: SendPushDto;

  @IsOptional()
  sms?: SendSmsDto;
}

export class NotificationResponseDto {
  success: boolean;
  channel: string;
  messageId: string;
  status: 'DELIVERED' | 'MOCK_SENT' | 'FAILED' | 'SKIPPED';
  error?: string;
  sentAt: string;
}

export class ChannelInfo {
  enabled: boolean;
  mode: string;
}

export class ChannelStatusDto {
  email: ChannelInfo;
  fcm: ChannelInfo;
  sms: ChannelInfo;
}

export class NotificationHistoryItemDto {
  id: string;
  channel: string;
  recipient: string;
  title?: string;
  status: 'DELIVERED' | 'MOCK_SENT' | 'FAILED' | 'SKIPPED';
  messageId: string;
  error?: string;
  sentAt: string;
}
