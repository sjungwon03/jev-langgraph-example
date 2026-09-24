import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AutomationRuleRecord,
  CreateAutomationRuleDto,
  AutomationTriggerType,
  AutomationActionType,
} from '@nest-msa/contracts';
import { ProxmoxMcpClient } from '../mcp/proxmox-mcp.client';
import { AuditService } from '../audit/audit.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AutomationService implements OnModuleInit {
  private readonly logger = new Logger(AutomationService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  private rules: AutomationRuleRecord[] = [
    {
      id: 'rule-001',
      name: '노드 메모리 임계치 감시 및 경고',
      description: '클러스터 노드의 메모리 사용률이 85%를 초과할 경우 알림 발행',
      triggerType: AutomationTriggerType.RESOURCE_THRESHOLD,
      thresholdMetric: 'mem',
      thresholdValue: 85,
      actionType: AutomationActionType.ALERT,
      enabled: true,
      createdAt: new Date().toISOString(),
      triggerCount: 3,
      lastTriggeredAt: new Date(Date.now() - 300000).toISOString(),
    },
    {
      id: 'rule-002',
      name: '중요 서비스 자율 복구 (Auto-Heal)',
      description: 'web-gateway-prod(100) 또는 app-api-worker(101) VM 다운 시 자동 재기동',
      triggerType: AutomationTriggerType.VM_STATUS_CHANGE,
      targetVmid: 101,
      actionType: AutomationActionType.AUTO_HEAL_RESTART,
      enabled: true,
      createdAt: new Date().toISOString(),
      triggerCount: 1,
      lastTriggeredAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  constructor(
    private readonly mcpClient: ProxmoxMcpClient,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    // Poll cluster telemetry every 20 seconds
    this.intervalHandle = setInterval(async () => {
      try {
        await this.evaluateRules();
      } catch (err: any) {
        this.logger.error(`Error in automation rule evaluation: ${err.message}`);
      }
    }, 20000);
    this.logger.log('⚡ Automation Scheduler running (20s interval).');
  }

  async evaluateRules() {
    const summary = await this.mcpClient.getClusterSummary();

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // 1. Resource Threshold evaluation
      if (rule.triggerType === AutomationTriggerType.RESOURCE_THRESHOLD) {
        for (const node of summary.nodes) {
          let metricPercent = 0;
          if (rule.thresholdMetric === 'cpu') metricPercent = (node.cpu || 0) * 100;
          if (rule.thresholdMetric === 'mem') {
            metricPercent = node.maxmem > 0 ? (node.mem / node.maxmem) * 100 : 0;
          }

          if (rule.thresholdValue && metricPercent >= rule.thresholdValue) {
            rule.triggerCount++;
            rule.lastTriggeredAt = new Date().toISOString();
            this.logger.warn(
              `🚨 [Automation Alert] Rule "${rule.name}" triggered on ${node.node}! Current: ${metricPercent.toFixed(1)}% >= Threshold: ${rule.thresholdValue}%`,
            );
            this.auditService.record(
              'automation-engine',
              'threshold_alert',
              'node',
              node.node,
              'SUCCESS',
              {
                ruleName: rule.name,
                metric: rule.thresholdMetric,
                value: metricPercent.toFixed(1),
              },
            );
          }
        }
      }

      // 2. VM Status Change & Auto-heal evaluation
      if (rule.triggerType === AutomationTriggerType.VM_STATUS_CHANGE && rule.targetVmid) {
        const vm = summary.vms.find((v) => v.vmid === rule.targetVmid);
        if (vm && vm.status === 'stopped' && rule.actionType === AutomationActionType.AUTO_HEAL_RESTART) {
          rule.triggerCount++;
          rule.lastTriggeredAt = new Date().toISOString();
          this.logger.warn(
            `🛠️ [Auto-Heal] Target VM ${vm.vmid} (${vm.name}) is stopped! Attempting auto-restart...`,
          );
          try {
            await this.mcpClient.callTool(`${vm.type}_start`, {
              node: vm.node,
              vmid: vm.vmid,
            });
            this.auditService.record(
              'automation-engine',
              'auto_heal_restart',
              vm.type,
              String(vm.vmid),
              'SUCCESS',
              { reason: 'VM was unexpectedly stopped', vmName: vm.name },
            );
          } catch (err: any) {
            this.logger.error(`Auto-heal failed for VM ${vm.vmid}: ${err.message}`);
          }
        }
      }
    }
  }

  getRules(): AutomationRuleRecord[] {
    return this.rules;
  }

  createRule(dto: CreateAutomationRuleDto): AutomationRuleRecord {
    const newRule: AutomationRuleRecord = {
      ...dto,
      id: `rule-${uuidv4().slice(0, 8)}`,
      enabled: dto.enabled !== undefined ? dto.enabled : true,
      createdAt: new Date().toISOString(),
      triggerCount: 0,
    };
    this.rules.push(newRule);
    this.auditService.record('user', 'create_automation_rule', 'rule', newRule.id, 'SUCCESS', {
      ruleName: newRule.name,
    });
    return newRule;
  }

  toggleRule(id: string): AutomationRuleRecord | null {
    const rule = this.rules.find((r) => r.id === id);
    if (!rule) return null;
    rule.enabled = !rule.enabled;
    this.auditService.record('user', 'toggle_automation_rule', 'rule', id, 'SUCCESS', {
      enabled: rule.enabled,
    });
    return rule;
  }

  deleteRule(id: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    this.auditService.record('user', 'delete_automation_rule', 'rule', id, 'SUCCESS');
    return true;
  }
}
