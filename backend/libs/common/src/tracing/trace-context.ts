import * as crypto from 'crypto';

export interface TraceOptions {
  traceId?: string;
  spanId?: string;
  parentId?: string;
  sampled?: boolean;
}

/**
 * Implements the W3C Trace Context specification (traceparent header)
 * Format: {version}-{trace_id}-{parent_id/span_id}-{trace_flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export class TraceContext {
  readonly version: string = '00';
  readonly traceId: string;
  readonly spanId: string;
  readonly parentId?: string;
  readonly sampled: boolean;

  constructor(options?: TraceOptions) {
    this.traceId = options?.traceId || crypto.randomBytes(16).toString('hex');
    this.spanId = options?.spanId || crypto.randomBytes(8).toString('hex');
    this.parentId = options?.parentId;
    this.sampled = options?.sampled ?? true;
  }

  /**
   * Serializes the context to a W3C traceparent string
   */
  toTraceparent(): string {
    const flags = this.sampled ? '01' : '00';
    return `${this.version}-${this.traceId}-${this.spanId}-${flags}`;
  }

  /**
   * Spawns a child trace context with a new spanId and current spanId as parentId
   */
  createChild(): TraceContext {
    return new TraceContext({
      traceId: this.traceId,
      spanId: crypto.randomBytes(8).toString('hex'),
      parentId: this.spanId,
      sampled: this.sampled,
    });
  }

  /**
   * Parses a W3C traceparent header string
   */
  static parse(header?: string | null): TraceContext | null {
    if (!header || typeof header !== 'string') return null;

    const parts = header.trim().split('-');
    if (parts.length < 4) return null;

    const [version, traceId, parentId, flags] = parts;
    if (version !== '00') return null; // Only W3C version 00 supported currently
    if (traceId.length !== 32 || parentId.length !== 16) return null;

    const sampled = (parseInt(flags, 16) & 1) === 1;

    return new TraceContext({
      traceId,
      spanId: crypto.randomBytes(8).toString('hex'),
      parentId,
      sampled,
    });
  }

  /**
   * Extracts or creates a valid TraceContext from headers
   */
  static fromHeaders(headers: Record<string, any> = {}): TraceContext {
    const headerValue =
      headers['traceparent'] ||
      headers['Traceparent'] ||
      headers['TRACEPARENT'] ||
      headers['x-trace-id'];

    if (headerValue && typeof headerValue === 'string') {
      const parsed = TraceContext.parse(headerValue);
      if (parsed) return parsed;

      // Fallback for simple UUID/hex trace-id
      return new TraceContext({
        traceId: headerValue.replace(/-/g, '').slice(0, 32).padEnd(32, '0'),
      });
    }

    return new TraceContext();
  }
}
