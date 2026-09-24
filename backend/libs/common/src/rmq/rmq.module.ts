import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RmqService } from './rmq.service';

export interface RmqModuleOptions {
  name: string;
  queue?: string;
  dlqOptions?: {
    deadLetterExchange?: string;
    deadLetterRoutingKey?: string;
  };
}

@Module({
  providers: [RmqService],
  exports: [RmqService],
})
export class RmqModule {
  static register({ name, queue, dlqOptions }: RmqModuleOptions): DynamicModule {
    const queueName = queue || `${name.toLowerCase()}_queue`;
    const uri = process.env.RABBITMQ_URI || 'amqp://localhost:5672';

    const queueOptions: Record<string, any> = {
      durable: true,
    };

    if (dlqOptions) {
      queueOptions.arguments = {
        'x-dead-letter-exchange': dlqOptions.deadLetterExchange || '',
        'x-dead-letter-routing-key': dlqOptions.deadLetterRoutingKey || `${queueName}_dlq`,
      };
    }

    return {
      module: RmqModule,
      imports: [
        ClientsModule.register([
          {
            name,
            transport: Transport.RMQ,
            options: {
              urls: [uri],
              queue: queueName,
              queueOptions,
            },
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
