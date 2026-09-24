import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CreateResourceRequestDto,
  ResourceRequestDto,
  ReviewResourceRequestDto,
} from '@nest-msa/contracts';
import { ProxmoxMcpClient } from '../mcp/proxmox-mcp.client';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ResourceRequestService {
  private readonly logger = new Logger(ResourceRequestService.name);

  // In-memory persistent request queue
  private requests: Map<string, ResourceRequestDto> = new Map([
    [
      'REQ-1001',
      {
        id: 'REQ-1001',
        title: '결제 MSA 성능 부하 테스트용 QEMU VM 신규 발급 요청',
        requesterName: '김개발',
        department: '페이먼트개발팀',
        type: 'CREATE_VM',
        reason: '신규 PG사 연동 성능 부하 테스트를 위한 독립 스테이징 환경 필요',
        spec: {
          name: 'payment-perf-worker',
          type: 'qemu',
          cores: 4,
          memory: 8192,
          disk: 50,
          os: 'Ubuntu 24.04 LTS',
        },
        status: 'PENDING',
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
    ],
    [
      'REQ-1002',
      {
        id: 'REQ-1002',
        title: '데이터 파이프라인 캐시용 LXC 디스크 20GB 확장 요청',
        requesterName: '박엔지니어',
        department: '데이터플랫폼팀',
        type: 'RESIZE_DISK',
        reason: '로그 수집량 급증에 따른 Redis 캐시 컨테이너 스토리지 임계치(85%) 도달',
        spec: {
          vmid: 103,
          node: 'pve-node-02',
          disk: '+20G',
        },
        status: 'PROVISIONED',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 82800000).toISOString(),
        reviewerName: '최인프라 팀장',
        reviewerComment: 'local-zfs 잔여 용량 322GB 확인 후 승인 및 즉시 확장 적용 완료',
        provisionedVmid: 103,
        upid: 'UPID:pve-node-02:00003001:00049281:65F00002:resize:103:root@pam:',
      },
    ],
    [
      'REQ-1003',
      {
        id: 'REQ-1003',
        title: '신규 AI 모델 서빙 프로토타입 스테이징 환경 발급',
        requesterName: '이연구',
        department: 'AI혁신팀',
        type: 'CREATE_VM',
        reason: 'LangGraph 기반 인프라 오케스트레이션 모델 로컬 서빙 검증',
        spec: {
          name: 'ai-serving-prototype',
          type: 'qemu',
          cores: 8,
          memory: 16384,
          disk: 100,
          os: 'Debian 12 Bookworm',
        },
        status: 'PENDING',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        updatedAt: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
  ]);

  constructor(
    private readonly mcpClient: ProxmoxMcpClient,
    private readonly auditService: AuditService,
  ) {}

  getAllRequests(status?: string, requester?: string): ResourceRequestDto[] {
    let list = Array.from(this.requests.values());
    if (status) {
      list = list.filter((r) => r.status === status);
    }
    if (requester) {
      list = list.filter((r) => r.requesterName.includes(requester) || r.department.includes(requester));
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getRequestById(id: string): ResourceRequestDto {
    const req = this.requests.get(id);
    if (!req) {
      throw new NotFoundException(`Resource request with ID "${id}" not found.`);
    }
    return req;
  }

  getStats() {
    const list = Array.from(this.requests.values());
    return {
      total: list.length,
      pending: list.filter((r) => r.status === 'PENDING').length,
      approved: list.filter((r) => r.status === 'APPROVED' || r.status === 'PROVISIONED').length,
      rejected: list.filter((r) => r.status === 'REJECTED').length,
    };
  }

  async createRequest(dto: CreateResourceRequestDto): Promise<ResourceRequestDto> {
    const id = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRequest: ResourceRequestDto = {
      id,
      title: dto.title,
      requesterName: dto.requesterName || '개발팀 엔지니어',
      department: dto.department || '서비스개발본부',
      type: dto.type,
      reason: dto.reason,
      spec: dto.spec || {},
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.requests.set(id, newRequest);
    this.logger.log(`📥 New Resource Request submitted: [${id}] "${dto.title}" by ${newRequest.requesterName} (${newRequest.department})`);

    this.auditService.record(
      'user',
      'CREATE_RESOURCE_REQUEST',
      'request',
      id,
      'WAITING_CONFIRMATION',
      { requesterName: newRequest.requesterName, department: newRequest.department, title: dto.title, type: dto.type, spec: dto.spec },
    );

    return newRequest;
  }

  async reviewRequest(
    id: string,
    dto: ReviewResourceRequestDto,
    reviewerName = '인프라 관리자',
  ): Promise<ResourceRequestDto> {
    const request = this.getRequestById(id);

    if (request.status !== 'PENDING') {
      return request;
    }

    if (dto.status === 'REJECTED') {
      request.status = 'REJECTED';
      request.reviewerName = reviewerName;
      request.reviewerComment = dto.reviewerComment || '자원 한도 초과 또는 정책 미부합으로 반려되었습니다.';
      request.updatedAt = new Date().toISOString();

      this.logger.warn(`❌ Resource Request [${id}] REJECTED by ${reviewerName}: ${request.reviewerComment}`);
      this.auditService.record(
        'user',
        'REJECT_RESOURCE_REQUEST',
        'request',
        id,
        'REJECTED',
        { reviewerName, reason: request.reviewerComment },
      );

      return request;
    }

    // Status is APPROVED -> Trigger automated Proxmox MCP provisioning!
    this.logger.log(`✅ Resource Request [${id}] APPROVED by ${reviewerName}. Initiating automated Proxmox MCP provisioning...`);
    request.reviewerName = reviewerName;
    request.reviewerComment = dto.reviewerComment || '인프라팀 검토 완료 및 자동 프로비저닝 승인';
    request.updatedAt = new Date().toISOString();

    try {
      if (request.type === 'CREATE_VM') {
        const targetNode = dto.targetNode || request.spec.node || 'pve-node-01';
        const tool = (request.spec.type || 'qemu') === 'lxc' ? 'lxc_create' : 'qemu_create';
        const createResult = await this.mcpClient.callTool(tool, {
          node: targetNode,
          name: request.spec.name || `dev-vm-${id.toLowerCase()}`,
          type: request.spec.type || 'qemu',
          cpus: request.spec.cores || 2,
          memory: request.spec.memory || 4096,
          diskSize: typeof request.spec.disk === 'number' ? request.spec.disk : 32,
        });

        request.status = 'PROVISIONED';
        request.targetNode = targetNode;
        request.provisionedVmid = createResult.vmid;
        request.upid = createResult.upid;

        this.logger.log(`🚀 Automated provisioning completed for [${id}]: VMID ${createResult.vmid} on ${targetNode}`);
        this.auditService.record(
          'user',
          'PROVISION_RESOURCE_REQUEST',
          'vm',
          String(createResult.vmid),
          'SUCCESS',
          { reviewerName, id, targetNode, vmid: createResult.vmid, upid: createResult.upid },
        );
      } else if (request.type === 'RESIZE_DISK') {
        const node = request.spec.node || 'pve-node-01';
        const vmid = request.spec.vmid || 101;
        const resizeResult = await this.mcpClient.callTool('qemu_resize_disk', {
          node,
          vmid,
          disk: 'scsi0',
          size: String(request.spec.disk || '+10G'),
        });

        request.status = 'PROVISIONED';
        request.provisionedVmid = vmid;
        request.upid = resizeResult.upid;

        this.auditService.record(
          'user',
          'RESIZE_RESOURCE_REQUEST',
          'vm',
          String(vmid),
          'SUCCESS',
          { reviewerName, id, vmid, upid: resizeResult.upid },
        );
      } else {
        request.status = 'APPROVED';
      }
    } catch (err: any) {
      this.logger.error(`Failed to automatically provision resource request [${id}]: ${err.message}`);
      request.status = 'APPROVED';
      request.reviewerComment += ` (자동 프로비저닝 대기: ${err.message})`;
    }

    return request;
  }
}
