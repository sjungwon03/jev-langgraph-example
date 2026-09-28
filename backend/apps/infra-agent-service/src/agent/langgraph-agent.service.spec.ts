import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { LangGraphAgentService } from './langgraph-agent.service';
import { InfraRemoteClient } from './infra-remote.client';

const answer = (choice: string, probability = 0.95) => ({ choice, confidence: probability, probabilities: { [choice]: probability } });

function toolArgs(name: string) {
  if (name === 'create_resource_request') {
    return {
      type: 'CREATE_VM',
      title: '새 VM 생성 신청',
      reason: '테스트 환경이 필요합니다.',
      spec: { type: 'qemu', cores: 2, memory: 4096, disk: 20 },
    };
  }
  if (name === 'review_resource_request') return { id: 'REQ-1001', status: 'APPROVED' };
  if (name === 'qemu_snapshot_create') return { node: 'pve-01', vmid: 101, snapname: 'before-update' };
  if (name === 'qemu_resize_disk') return { node: 'pve-01', vmid: 101, size: '+20G' };
  if (name.startsWith('qemu_')) return { node: 'pve-01', vmid: 101 };
  return {};
}

function mockLlm() {
  const argumentInvoke = jest.fn(async (_args: any[]) => ({ tool_calls: [] as any[] }));
  const bindTools = jest.fn((tools: any[]) => {
    const name = tools[0].function.name;
    return {
      invoke: async (...args: any[]) => {
        await argumentInvoke(args);
        return { tool_calls: [{ name, args: toolArgs(name) }] };
      },
    };
  });
  return {
    bindTools,
    argumentInvoke,
    invoke: jest.fn().mockResolvedValue({ content: '요청 처리 결과입니다.' }),
  };
}

function setup(action: string, role: 'DEV_TEAM' | 'INFRA_TEAM' = 'DEV_TEAM') {
  const remote = {
    getResourceRequests: jest.fn().mockResolvedValue([]),
    executeTool: jest.fn().mockResolvedValue({ ok: true }),
    createResourceRequest: jest.fn().mockResolvedValue({ id: 'REQ-123', status: 'PENDING' }),
  } as unknown as InfraRemoteClient;
  const service = new LangGraphAgentService(new ConfigService({ JEV_API_KEY: 'test-key', JEV_USE_BASE_AUTH: 'false', JEV_AUTH_TYPE: 'bearer' }), remote);
  (service as any).llm = mockLlm();
  const firstDecision = { answers: { action: answer(action) } };
  const decide = jest.fn().mockResolvedValueOnce(firstDecision).mockResolvedValue({ answers: { action: answer('finish') } });
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
    expect(decide).toHaveBeenCalledTimes(2);
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

  it('resumes the paused graph on approval and runs the destructive tool once', async () => {
    const { service, remote } = setup('qemu_delete', 'INFRA_TEAM');
    const invoke = jest.fn().mockResolvedValue({ content: 'VM 삭제 작업이 완료되었습니다.' });
    (service as any).llm.invoke = invoke;
    const chunks = await collect(service, 'node pve-01 VM 101 삭제', 'INFRA_TEAM');
    const token = chunks.find((chunk) => chunk.type === 'confirmation_required')?.confirmation.token;
    expect(token).toBeTruthy();
    expect(remote.executeTool).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    const graphRunId = service.getConfirmation(token)!.graphRunId;
    expect((service as any).checkpointer.storage[graphRunId]).toBeDefined();
    const result = await service.resolveConfirmation(token, true);
    expect(result.status).toBe('EXECUTED');
    expect(result.result).toEqual({ ok: true });
    expect(result.response).toBe('VM 삭제 작업이 완료되었습니다.');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(remote.executeTool).toHaveBeenCalledTimes(1);
    expect(remote.executeTool).toHaveBeenCalledWith('qemu_delete', { node: 'pve-01', vmid: 101, confirm: true });
    expect((service as any).checkpointer.storage[graphRunId]).toBeUndefined();
    await expect(service.resolveConfirmation(token, true)).rejects.toThrow('유효하지 않거나');
  });

  it('resumes the paused graph on rejection without executing the tool', async () => {
    const { service, remote } = setup('qemu_delete', 'INFRA_TEAM');
    const chunks = await collect(service, 'node pve-01 VM 101 삭제', 'INFRA_TEAM');
    const token = chunks.find((chunk) => chunk.type === 'confirmation_required')?.confirmation.token;
    const result = await service.resolveConfirmation(token, false);
    expect(result.status).toBe('REJECTED');
    expect(remote.executeTool).not.toHaveBeenCalled();
  });

  it('rejects an expired confirmation without resuming the destructive tool', async () => {
    const { service, remote } = setup('qemu_delete', 'INFRA_TEAM');
    const chunks = await collect(service, 'node pve-01 VM 101 삭제', 'INFRA_TEAM');
    const token = chunks.find((chunk) => chunk.type === 'confirmation_required')?.confirmation.token;
    service.getConfirmation(token)!.expiresAt = Date.now() - 1;
    await expect(service.resolveConfirmation(token, true)).rejects.toThrow('유효하지 않거나');
    expect(remote.executeTool).not.toHaveBeenCalled();
  });

  it('uses the LLM for arguments after JEV routing and again for final synthesis', async () => {
    const { service, remote, decide } = setup('list_nodes');
    const invoke = jest.fn().mockResolvedValue({ content: '노드 조회 결과입니다.' });
    (service as any).llm.invoke = invoke;
    const chunks = await collect(service, '노드 목록 보여줘', 'INFRA_TEAM');
    expect(decide).toHaveBeenCalledTimes(2);
    expect((service as any).llm.bindTools).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'list_nodes', parameters: expect.any(Object) }),
      }),
    ], { tool_choice: 'list_nodes' });
    expect(remote.executeTool).toHaveBeenCalledWith('list_nodes', {});
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(chunks.find((chunk) => chunk.type === 'content')?.content).toBe('노드 조회 결과입니다.');
  });

  it('executes the structured arguments produced by the LLM after JEV chooses the route', async () => {
    const { service, remote } = setup('qemu_start', 'INFRA_TEAM');
    (service as any).llm.bindTools = jest.fn(() => ({
      invoke: jest.fn().mockResolvedValue({
        tool_calls: [{ name: 'qemu_start', args: { node: 'llm-selected-node', vmid: 777 } }],
      }),
    }));
    await collect(service, '선택한 가상 머신을 시작해줘', 'INFRA_TEAM');
    expect(remote.executeTool).toHaveBeenCalledWith('qemu_start', { node: 'llm-selected-node', vmid: 777 });
  });

  it('does not execute a tool when the LLM omits required schema arguments', async () => {
    const { service, remote } = setup('qemu_start', 'INFRA_TEAM');
    (service as any).llm.bindTools = jest.fn(() => ({
      invoke: jest.fn().mockResolvedValue({
        tool_calls: [{ name: 'qemu_start', args: { node: 'pve-01' } }],
      }),
    }));
    const chunks = await collect(service, '가상 머신을 시작해줘', 'INFRA_TEAM');
    expect(remote.executeTool).not.toHaveBeenCalled();
    expect(chunks.find((chunk) => chunk.type === 'content')?.content).toContain('vmid');
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

  it('returns to JEV after each result and runs a distinct second tool before LLM synthesis', async () => {
    const { service, remote, decide } = setup('list_nodes', 'INFRA_TEAM');
    decide.mockReset()
      .mockResolvedValueOnce({ answers: { action: answer('list_nodes') } })
      .mockResolvedValueOnce({ answers: { action: answer('get_storage') } })
      .mockResolvedValueOnce({ answers: { action: answer('finish') } });
    const invoke = jest.fn().mockResolvedValue({ content: '노드와 스토리지 결과입니다.' });
    (service as any).llm.invoke = invoke;
    const chunks = await collect(service, '노드와 스토리지 보여줘', 'INFRA_TEAM');
    expect(decide).toHaveBeenCalledTimes(3);
    expect(decide.mock.calls[1][0].completedTools).toEqual([{ name: 'list_nodes', args: {}, result: '{"ok":true}' }]);
    expect(remote.executeTool).toHaveBeenNthCalledWith(1, 'list_nodes', {});
    expect(remote.executeTool).toHaveBeenNthCalledWith(2, 'get_storage', {});
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0][0].content).toContain('get_storage');
    expect(chunks.filter((chunk) => chunk.type === 'tool_end')).toHaveLength(2);
  });

  it('stops when JEV selects an already executed action', async () => {
    const { service, remote, decide } = setup('create_resource_request');
    decide.mockReset().mockResolvedValue({ answers: {
      action: answer('create_resource_request'), requestType: answer('CREATE_VM'),
      workload: answer('web'), size: answer('small'),
    } });
    const chunks = await collect(service, '새 VM 생성 신청해줘', 'DEV_TEAM');
    expect(decide).toHaveBeenCalledTimes(2);
    expect(remote.createResourceRequest).toHaveBeenCalledTimes(1);
    expect(chunks.filter((chunk) => chunk.type === 'tool_end')).toHaveLength(1);
  });

  it('caps a continuing graph at three tool executions', async () => {
    const { service, remote, decide } = setup('list_nodes', 'INFRA_TEAM');
    decide.mockReset()
      .mockResolvedValueOnce({ answers: { action: answer('list_nodes') } })
      .mockResolvedValueOnce({ answers: { action: answer('get_storage') } })
      .mockResolvedValueOnce({ answers: { action: answer('cluster_resources') } });
    const chunks = await collect(service, '노드, 스토리지, VM 현황 보여줘', 'INFRA_TEAM');
    expect(decide).toHaveBeenCalledTimes(3);
    expect(remote.executeTool).toHaveBeenCalledTimes(3);
    expect(remote.executeTool).toHaveBeenNthCalledWith(3, 'cluster_resources', {});
    expect(chunks.filter((chunk) => chunk.type === 'tool_end')).toHaveLength(3);
  });
});
