import { Injectable, Logger } from '@nestjs/common';
import { TraceContext } from './trace-context';
import { RequestContextService } from '../context/request-context.service';

export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  parentId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'OK' | 'ERROR';
  tags: Record<string, any>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, any> }>;
}

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private readonly activeSpans = new Map<string, Span>();

  constructor(private readonly requestContext?: RequestContextService) {}

  /**
   * Starts a new span under the active trace context
   */
  startSpan(name: string, parentContext?: TraceContext, tags: Record<string, any> = {}): Span {
    const context = parentContext
      ? parentContext.createChild()
      : this.getCurrentTraceContext() || new TraceContext();

    const span: Span = {
      name,
      traceId: context.traceId,
      spanId: context.spanId,
      parentId: context.parentId,
      startTime: Date.now(),
      status: 'OK',
      tags,
      events: [],
    };

    this.activeSpans.set(span.spanId, span);
    return span;
  }

  /**
   * Adds an event log to the active span
   */
  addEvent(spanId: string, eventName: string, attributes?: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.events.push({
        name: eventName,
        timestamp: Date.now(),
        attributes,
      });
    }
  }

  /**
   * Sets tag on active span
   */
  setTag(spanId: string, key: string, value: any): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.tags[key] = value;
    }
  }

  /**
   * Completes a span and records its duration
   */
  endSpan(spanId: string, status: 'OK' | 'ERROR' = 'OK', error?: Error): Span | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) return undefined;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;

    if (error) {
      span.tags['error'] = true;
      span.tags['error.message'] = error.message;
      span.tags['error.stack'] = error.stack;
    }

    this.activeSpans.delete(spanId);
    return span;
  }

  /**
   * Resolves the current trace context from RequestContextService if present
   */
  getCurrentTraceContext(): TraceContext | null {
    const current = RequestContextService.current();
    if (current && current.traceId) {
      return new TraceContext({
        traceId: current.traceId.replace(/-/g, '').slice(0, 32).padEnd(32, '0'),
        spanId: current.spanId,
        parentId: current.parentSpanId,
      });
    }
    return null;
  }
}
