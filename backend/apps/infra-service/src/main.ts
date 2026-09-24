import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('InfraService');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Proxmox Infrastructure Microservice')
    .setDescription('Dedicated Proxmox VE & MCP Infrastructure Execution Engine')
    .setVersion('1.0.0')
    .addTag('Infrastructure Management')
    .addTag('Resource Requests (Dev vs Infra Workflow)')
    .addTag('Automation Rules')
    .addTag('Audit Logs')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.INFRA_PORT || process.env.PORT || 3020;
  await app.listen(port);
  logger.log(`🚀 Proxmox Infrastructure Service running on port ${port}`);
  logger.log(`📑 Swagger Documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
