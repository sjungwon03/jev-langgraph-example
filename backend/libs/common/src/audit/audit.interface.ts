export interface AuditActor {
  id?: string;
  email?: string;
  role?: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  resource: string;
  actor?: AuditActor;
  clientIp?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  timestamp: string;
  traceId?: string;
  metadata?: Record<string, any>;
  errorMessage?: string;
}

export interface AuditOptions {
  action: string;
  resource: string;
  metadata?: Record<string, any>;
}
