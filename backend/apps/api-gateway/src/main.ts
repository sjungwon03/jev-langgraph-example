import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { getUnifiedSwaggerDocument } from './docs/unified-spec';

async function bootstrap() {
  const logger = new Logger('ApiGateway');
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const document = getUnifiedSwaggerDocument() as any;

  // Single, unified, complete Swagger UI showing all endpoints across microservices
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Proxmox MCP & LangGraph Unified API Docs',
  });
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Proxmox MCP & LangGraph Unified API Docs',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🌐 API Gateway running on port ${port}`);
  logger.log(`📑 Unified Swagger Documentation available at http://localhost:${port}/docs and http://localhost:${port}/api/docs`);
}

bootstrap();
