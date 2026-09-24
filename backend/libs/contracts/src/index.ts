import * as fs from 'fs';
import * as path from 'path';

export * from './constants/services.constant';
export * from './constants/queues.constant';
export * from './patterns/auth.pattern';
export * from './patterns/notification.pattern';
export * from './events/user-created.event';
export * from './dto/auth.dto';
export * from './dto/notification.dto';
export * from './dto/proxmox.dto';
export * from './dto/chat.dto';
export * from './dto/automation.dto';
export * from './dto/resource-request.dto';
export * from './generated/auth';
export {
  NotificationGrpcServiceClient,
  NotificationGrpcServiceController,
  NotificationGrpcServiceControllerMethods,
  SendEmailRequest,
  SendPushRequest,
  SendSmsRequest,
  SendNotificationRequest,
  NotificationResponse,
  ChannelStatusRequest,
  ChannelDetail,
  ChannelStatusResponse,
  HistoryRequest,
  HistoryItem,
  HistoryResponse,
  NOTIFICATION_PACKAGE_NAME,
  NOTIFICATION_GRPC_SERVICE_NAME,
} from './generated/notification';
export * as NotificationProto from './generated/notification';


export function getAuthProtoPath(): string {
  const candidates = [
    path.resolve(__dirname, '../proto/auth.proto'),
    path.resolve(__dirname, 'proto/auth.proto'),
    path.resolve(process.cwd(), 'libs/contracts/src/proto/auth.proto'),
    path.resolve(process.cwd(), '../../libs/contracts/src/proto/auth.proto'),
    path.resolve(process.cwd(), '../contracts/src/proto/auth.proto'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function getNotificationProtoPath(): string {
  const candidates = [
    path.resolve(__dirname, '../proto/notification.proto'),
    path.resolve(__dirname, 'proto/notification.proto'),
    path.resolve(process.cwd(), 'libs/contracts/src/proto/notification.proto'),
    path.resolve(process.cwd(), '../../libs/contracts/src/proto/notification.proto'),
    path.resolve(process.cwd(), '../contracts/src/proto/notification.proto'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

