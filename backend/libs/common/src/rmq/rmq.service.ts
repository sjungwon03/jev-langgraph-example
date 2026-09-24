import { Injectable } from '@nestjs/common';
import { RmqContext, RmqOptions, Transport } from '@nestjs/microservices';

export interface RmqDlqOptions {
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
}

@Injectable()
export class RmqService {
  getOptions(queue: string, noAck = false, dlqOptions?: RmqDlqOptions): RmqOptions {
    const uri = process.env.RABBITMQ_URI || 'amqp://localhost:5672';

    const queueOptions: Record<string, any> = {
      durable: true,
    };

    if (dlqOptions) {
      queueOptions.arguments = {
        'x-dead-letter-exchange': dlqOptions.deadLetterExchange || '',
        'x-dead-letter-routing-key': dlqOptions.deadLetterRoutingKey || `${queue}_dlq`,
      };
    }

    return {
      transport: Transport.RMQ,
      options: {
        urls: [uri],
        queue,
        noAck,
        persistent: true,
        queueOptions,
      },
    };
  }

  /**
   * 메시지 정상 수신 확인 (ACK)
   */
  ack(context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();
    channel.ack(originalMessage);
  }

  /**
   * 메시지 처리 실패 시 거부 (NACK)
   * requeue = false 설정 시 DLQ(Dead Letter Queue)로 즉시 격리
   */
  nack(context: RmqContext, requeue = false) {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();
    channel.nack(originalMessage, false, requeue);
  }
}
