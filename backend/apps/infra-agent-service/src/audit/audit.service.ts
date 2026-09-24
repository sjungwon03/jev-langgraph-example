import { Injectable } from '@nestjs/common';
import { AuditLogRecord } from '@nest-msa/contracts';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuditService {
  private logs: AuditLogRecord[] = [
    {
      id: 'aud-001',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      actor: 'ai-agent',
      action: 'qemu_start',
      targetKind: 'ai-decision',
      targetId: 'main-thread',
      status: 'SUCCESS',
      details: {
        prompt: '101번 VM 기동해줘',
        intent: 'vm_start',
        tool: 'qemu_start',
        args: { node: 'pve-node-01', vmid: 101 },
        why: '사용자 입력 "101번 VM 기동해줘"에서 인스턴스 전원 기동 의도 및 대상 VMID 101을 감지하여 qemu_start 도구를 호출하도록 결정했습니다.',
        safetyEvaluation: 'SAFE - 인스턴스 정상 가동 작업으로 즉시 실행 허용되었습니다.',
        latencyMs: 14,
        upid: 'UPID:pve-node-01:00001001:00000000:1718000000:qmstart:101:root@pam:',
      },
    },
    {
      id: 'aud-002',
      timestamp: new Date(Date.now() - 2400000).toISOString(),
      actor: 'ai-agent',
      action: 'cluster_resources',
      targetKind: 'ai-decision',
      targetId: 'main-thread',
      status: 'SUCCESS',
      details: {
        prompt: '현재 클러스터 상태 알려줘',
        intent: 'cluster_resources',
        tool: 'cluster_resources',
        args: {},
        why: '사용자 입력 "현재 클러스터 상태 알려줘"에서 전체 가상머신 및 자원 인벤토리 조회 의도를 감지하여 cluster_resources 도구를 선택했습니다.',
        safetyEvaluation: 'SAFE - 읽기 전용 인벤토리 쿼리입니다.',
        latencyMs: 9,
      },
    },
    {
      id: 'aud-003',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      actor: 'automation-engine',
      action: 'health_check',
      targetKind: 'cluster',
      targetId: 'all',
      status: 'SUCCESS',
      details: { summary: 'Cluster resources checked, all nodes healthy.' },
    },
  ];

  getDecisionLogs(limit = 50): AuditLogRecord[] {
    return this.logs
      .filter((l) => l.targetKind === 'ai-decision' || l.actor === 'ai-agent')
      .slice(0, limit);
  }

  record(
    actor: 'user' | 'automation-engine' | 'ai-agent',
    action: string,
    targetKind: string,
    targetId: string,
    status: 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WAITING_CONFIRMATION',
    details?: Record<string, any>,
  ): AuditLogRecord {
    const log: AuditLogRecord = {
      id: `aud-${uuidv4().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      targetKind,
      targetId,
      status,
      details,
    };
    this.logs.unshift(log); // Keep most recent first
    if (this.logs.length > 500) this.logs.pop();
    return log;
  }

  getLogs(limit = 50): AuditLogRecord[] {
    return this.logs.slice(0, limit);
  }
}
