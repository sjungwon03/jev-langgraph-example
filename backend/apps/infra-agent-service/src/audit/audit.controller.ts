import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Audit Logs')
@Controller('api/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Get recent infrastructure audit and AI action logs' })
  getLogs(@Query('limit') limit?: number) {
    return this.auditService.getLogs(limit ? Number(limit) : 50);
  }

  @Get('decisions')
  @ApiOperation({ summary: 'Get AI agent reasoning and tool decision logs' })
  getDecisionLogs(@Query('limit') limit?: number) {
    return this.auditService.getDecisionLogs(limit ? Number(limit) : 50);
  }
}
