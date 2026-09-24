export const NOTIFICATION_PATTERNS = {
  SEND_EMAIL: 'notification.send_email',
  SEND_PUSH: 'notification.send_push',
  SEND_SMS: 'notification.send_sms',
  SEND_NOTIFICATION: 'notification.send',
  GET_CHANNEL_STATUS: 'notification.channel_status',
  GET_HISTORY: 'notification.get_history',
} as const;

export const NOTIFICATION_EVENTS = {
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',
} as const;
