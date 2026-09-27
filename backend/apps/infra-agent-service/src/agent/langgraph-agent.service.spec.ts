import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { LangGraphAgentService } from './langgraph-agent.service';
import { InfraRemoteClient } from './infra-remote.client';

const answer = (choice: string, probability = 0.95) => ({ choice, confidence: probability, probabilities: { [choice]: probability } });

function setup(action: string, role: 'DEV_TEAM' | 'INFRA_TEAM' = 'DEV_TEAM') {
  const remote = {
    getResourceRequests: jest.fn().mockResolvedValue([]),
    executeTool: jest.fn().mockResolvedValue({ ok: true }),
    createResourceRequest: jest.fn().mockResolvedValue({ id: 'REQ-123', status: 'PENDING' }),
  } as unknown as InfraRemoteClient;
  const service = new LangGraphAgentService(new ConfigService({ JEV_API_KEY: 'test-key', JEV_USE_BASE_AUTH: 'false', JEV_AUTH_TYPE: 'bearer' }), remote);
  const decide = jest.fn().mockResolvedValue({ answers: {
    action: answer(action), requestType: answer('CREATE_VM'), reviewStatus: answer('none'),
    workload: answer('web'), size: answer('small'),
  } });
  jest.spyOn(service.getJevClient(), 'decide').mockImplementation(decide);
  return { service, remote, decide, role };
}

async function collect(service: LangGraphAgentService, message: string, role: 'DEV_TEAM' | 'INFRA_TEAM') {
  const chunks: any[] = [];
  for await (const chunk of service.processStream(message, 'test-thread', role, 'tester')) chunks.push(chunk);
  return chunks;
}

describe('JEV routing and response separation', () => {
  it('uses JEV for request history and does not create a new ticket', async () => {
    const { service, remote, decide } = setup('list_resource_requests');
    const chunks = await collect(service, '내 신청 내역 보여줘', 'DEV_TEAM');
    expect(decide).toHaveBeenCalledTimes(1);
    expect((remote.getResourceRequests as jest.Mock)).toHaveBeenCalledWith(undefined, 'tester');
    expect(remote.createResourceRequest).not.toHaveBeenCalled();
    expect(chunks.find((chunk) => chunk.type === 'decision')?.decision.tool).toBe('list_resource_requests');
  });

  it('blocks a developer from directly changing a VM even if JEV selects it', async () => {
    const { service, remote } = setup('qemu_start');
    const chunks = await collect(service, 'node pve-01 VM 101 시작', 'DEV_TEAM');
    expect(remote.executeTool).not.toHaveBeenCalled();
    expect(chunks.find((chunk) => chunk.type === 'decision')?.decision.safetyEvaluation).toBe('GOVERNANCE');
  });

  it('requires approval before a destructive infrastructure action', async () => {
    const { service, remote } = setup('qemu_delete', 'INFRA_TEAM');
    const chunks = await collect(service, 'node pve-01 VM 101 삭제', 'INFRA_TEAM');
    expect(remote.executeTool).not.toHaveBeenCalled();
    expect(chunks.some((chunk) => chunk.type === 'confirmation_required')).toBe(true);
  });

  it('calls the LLM only after JEV routing and tool execution', async () => {
    const { service, remote, decide } = setup('list_nodes');
    const invoke = jest.fn().mockResolvedValue({ content: '노드 조회 결과입니다.' });
    (service as any).llm = { invoke };
    const chunks = await collect(service, '노드 목록 보여줘', 'INFRA_TEAM');
    expect(decide).toHaveBeenCalledTimes(1);
    expect(remote.executeTool).toHaveBeenCalledWith('list_nodes', {});
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(chunks.find((chunk) => chunk.type === 'content')?.content).toBe('노드 조회 결과입니다.');
  });

  it('does not execute a low probability infrastructure choice', async () => {
    const { service, remote } = setup('qemu_start', 'INFRA_TEAM');
    jest.spyOn(service.getJevClient(), 'decide').mockResolvedValue({ answers: {
      action: answer('qemu_start', 0.4),
    } });
    const chunks = await collect(service, 'node pve-01 VM 101 시작', 'INFRA_TEAM');
    expect(remote.executeTool).not.toHaveBeenCalled();
    expect(chunks.find((chunk) => chunk.type === 'decision')?.decision.safetyEvaluation).toBe('CAUTION');
  });
});
