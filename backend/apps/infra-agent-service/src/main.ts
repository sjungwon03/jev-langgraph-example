import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('InfraAgentService');
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
    .setTitle('Proxmox LangGraph AI Chat Agent')
    .setDescription('Autonomous AI Infrastructure Control Server powered by LangGraph (Calling remote Infra Service)')
    .setVersion('1.0.0')
    .addTag('Chatbot & Agent')
    .addTag('Audit Logs')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3010;
  await app.listen(port);
  logger.log(`🚀 Proxmox Infra Agent Service running on port ${port}`);
  logger.log(`📑 Swagger Documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
