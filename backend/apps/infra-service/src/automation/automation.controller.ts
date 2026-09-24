import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { CreateAutomationRuleDto } from '@nest-msa/contracts';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Automation Rules')
@Controller('api/automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('rules')
  @ApiOperation({ summary: 'Get all automation and auto-heal rules' })
  getRules() {
    return this.automationService.getRules();
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a new automation rule' })
  createRule(@Body() dto: CreateAutomationRuleDto) {
    return this.automationService.createRule(dto);
  }

  @Patch('rules/:id/toggle')
  @ApiOperation({ summary: 'Toggle enable/disable status of a rule' })
  toggleRule(@Param('id') id: string) {
    return this.automationService.toggleRule(id);
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete an automation rule' })
  deleteRule(@Param('id') id: string) {
    return { success: this.automationService.deleteRule(id) };
  }
}
