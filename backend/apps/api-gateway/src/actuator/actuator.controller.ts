import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';

// Graceful fallback if @nestjs/swagger is not present in lightweight test environments
let ApiTags: (tag: string) => ClassDecorator = () => () => {};
let ApiOperation: (options: any) => MethodDecorator = () => () => {};
try {
  const swagger = require('@nestjs/swagger');
  if (swagger.ApiTags) ApiTags = swagger.ApiTags;
  if (swagger.ApiOperation) ApiOperation = swagger.ApiOperation;
} catch (e) {}

@ApiTags('Actuator')
@Controller('actuator')
export class ActuatorController {
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  health() {
    return {
      status: 'UP',
      components: {
        gateway: { status: 'UP' },
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('info')
  @ApiOperation({ summary: 'Gateway application metadata' })
  info() {
    return {
      app: {
        name: 'api-gateway',
        description: 'Proxmox MCP & LangGraph MSA API Gateway',
        version: '1.0.0',
      },
    };
  }
}
