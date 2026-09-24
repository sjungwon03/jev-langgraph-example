import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ProxyController } from './proxy/proxy.controller';
import { ActuatorController } from './actuator/actuator.controller';
import { DocsController } from './docs/docs.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../infra/env/.env', '../infra/env/.env'],
    }),
    HttpModule.register({
      timeout: 120000,
      maxRedirects: 5,
    }),
  ],
  controllers: [ActuatorController, ProxyController, DocsController],
  providers: [],
})
export class AppModule {}
