export interface ProxmoxStorage {
  storage: string;
  node: string;
  type: string;
  content: string;
  active: number;
  enabled: number;
  used: number;
  total: number;
  avail: number;
}

export interface ClusterSummary {
  version: string;
  nodes: ProxmoxNode[];
  vms: ProxmoxVm[];
  storage: ProxmoxStorage[];
  totalCpuUsage: number;
  totalMemUsage: number;
  totalDiskUsage: number;
}

export interface ProxmoxNode {
  node: string;
  status: 'online' | 'offline';
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

export interface ProxmoxVm {
  vmid: number;
  name: string;
  node: string;
  status: 'running' | 'stopped' | 'paused';
  type: 'qemu' | 'lxc';
  cpu: number;
  cpus: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  triggerType: string;
  thresholdMetric?: 'cpu' | 'mem' | 'disk';
  thresholdValue?: number;
  actionType: string;
  enabled: boolean;
  triggerCount: number;
  lastTriggeredAt?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  targetKind: string;
  targetId: string;
  status: 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WAITING_CONFIRMATION';
  details?: any;
}

export interface StreamChunk {
  type:
    | 'thought'
    | 'decision'
    | 'tool_start'
    | 'tool_end'
    | 'confirmation_required'
    | 'content'
    | 'error'
    | 'done';
  content?: string;
  tool?: string;
  input?: any;
  output?: any;
  decision?: {
    intent: string;
    tool?: string;
    why: string;
    safetyEvaluation?: string;
    args?: Record<string, any>;
    latencyMs?: number;
  };
  confirmation?: {
    token: string;
    action: string;
    node: string;
    vmid: number;
    description: string;
    expiresAt: string;
  };
  error?: string;
  threadId?: string;
}

const API_BASE = ''; // Uses Next.js rewrite or direct proxy

async function safeJson<T>(res: Response, fallbackMessage: string = '요청 처리에 실패했습니다.'): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`서버 오류 (${res.status}): ${text.slice(0, 120) || res.statusText || fallbackMessage}`);
    }
    throw new Error(`응답 형식이 올바르지 않습니다 (${res.status}).`);
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || fallbackMessage);
  }
  return json as T;
}

async function safeJsonOrFallback<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return fallback;
  return res.json().catch(() => fallback);
}

export async function fetchClusterSummary(): Promise<ClusterSummary> {
  const res = await fetch(`${API_BASE}/api/infra/summary`);
  return safeJson<ClusterSummary>(res, '클러스터 요약 정보를 불러오지 못했습니다.');
}

export async function fetchNodes(): Promise<ProxmoxNode[]> {
  const res = await fetch(`${API_BASE}/api/infra/nodes`);
  return safeJson<ProxmoxNode[]>(res, '노드 목록을 불러오지 못했습니다.');
}

export async function executeVmAction(
  node: string,
  vmid: number,
  action: 'start' | 'stop' | 'reboot' | 'shutdown' | 'force_stop' | 'delete',
  confirm: boolean = false,
): Promise<{ success: boolean; message?: string; [key: string]: any }> {
  const res = await fetch(`${API_BASE}/api/infra/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node, vmid, action, confirm }),
  });
  return safeJson<{ success: boolean; message?: string; [key: string]: any }>(res, 'VM 작업을 실행하지 못했습니다.');
}

export async function fetchAutomationRules(): Promise<AutomationRule[]> {
  const res = await fetch(`${API_BASE}/api/automation/rules`);
  return safeJson<AutomationRule[]>(res, '자동화 규칙 목록을 불러오지 못했습니다.');
}

export async function toggleAutomationRule(id: string): Promise<AutomationRule> {
  const res = await fetch(`${API_BASE}/api/automation/rules/${id}/toggle`, {
    method: 'PATCH',
  });
  return safeJson<AutomationRule>(res, '규칙 상태를 변경하지 못했습니다.');
}

export async function createAutomationRule(data: Partial<AutomationRule>): Promise<AutomationRule> {
  const res = await fetch(`${API_BASE}/api/automation/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return safeJson<AutomationRule>(res, '자동화 규칙 생성에 실패했습니다.');
}

export async function deleteAutomationRule(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/automation/rules/${id}`, { method: 'DELETE' });
}

export async function fetchAuditLogs(limit = 30): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/api/audit/logs?limit=${limit}`);
  return safeJsonOrFallback<AuditLog[]>(res, []);
}

export async function fetchDecisionLogs(limit = 50): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/api/audit/decisions?limit=${limit}`);
  return safeJsonOrFallback<AuditLog[]>(res, []);
}

export async function confirmAction(
  token: string,
  approved: boolean,
): Promise<{ success: boolean; message?: string; [key: string]: any }> {
  const res = await fetch(`${API_BASE}/api/chat/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, approved }),
  });
  return safeJson<{ success: boolean; message?: string; [key: string]: any }>(res, '작업 확인 처리에 실패했습니다.');
}

export async function createInstance(data: {
  node: string;
  vmid: number;
  name: string;
  type: 'qemu' | 'lxc';
  cpus: number;
  memory: number;
  diskSize: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/infra/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return safeJson<any>(res, '인스턴스 생성 요청에 실패했습니다.');
}

export async function fetchSnapshots(node: string, vmid: number): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/infra/snapshots?node=${node}&vmid=${vmid}`);
  return safeJsonOrFallback<any[]>(res, []);
}

export async function createSnapshot(data: {
  node: string;
  vmid: number;
  snapname: string;
  description?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/infra/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return safeJson<any>(res, '스냅샷 생성에 실패했습니다.');
}

export async function resizeVmDisk(node: string, vmid: number, size: string = '+10G'): Promise<any> {
  const res = await fetch(`${API_BASE}/api/infra/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node, vmid, disk: 'scsi0', size }),
  });
  return safeJson<any>(res, '디스크 리사이즈에 실패했습니다.');
}

export interface ProxmoxNetwork {
  iface: string;
  node: string;
  type: string;
  cidr: string;
  gateway?: string;
  active: number;
  autostart: number;
  ports?: string;
  comment?: string;
}

export interface ProxmoxTask {
  upid: string;
  node: string;
  type: string;
  id: string;
  user: string;
  status: string;
  starttime?: number;
  endtime?: number;
}

export interface ClusterTopology {
  datacenter: string;
  nodes: (ProxmoxNode & {
    vms: ProxmoxVm[];
    storage: ProxmoxStorage[];
    networks: ProxmoxNetwork[];
  })[];
}

export async function fetchNetworks(node?: string): Promise<ProxmoxNetwork[]> {
  const url = node ? `${API_BASE}/api/infra/networks?node=${node}` : `${API_BASE}/api/infra/networks`;
  const res = await fetch(url);
  return safeJsonOrFallback<ProxmoxNetwork[]>(res, []);
}

export async function fetchTasks(node?: string): Promise<ProxmoxTask[]> {
  const url = node ? `${API_BASE}/api/infra/tasks?node=${node}` : `${API_BASE}/api/infra/tasks`;
  const res = await fetch(url);
  return safeJsonOrFallback<ProxmoxTask[]>(res, []);
}

export async function fetchTopology(): Promise<ClusterTopology> {
  const res = await fetch(`${API_BASE}/api/infra/topology`);
  return safeJson<ClusterTopology>(res, '클러스터 토폴로지 정보를 불러오지 못했습니다.');
}

export async function fetchStorage(node?: string): Promise<ProxmoxStorage[]> {
  const url = node ? `${API_BASE}/api/infra/storage?node=${node}` : `${API_BASE}/api/infra/storage`;
  const res = await fetch(url);
  return safeJsonOrFallback<ProxmoxStorage[]>(res, []);
}

export interface ResourceRequest {
  id: string;
  title: string;
  requesterName: string;
  department: string;
  type: 'CREATE_VM' | 'RESIZE_DISK' | 'DELETE_VM';
  reason: string;
  spec: {
    node?: string;
    vmid?: number;
    name?: string;
    cores?: number;
    memory?: number;
    disk?: number | string;
    type?: 'qemu' | 'lxc';
  };
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROVISIONED' | 'FAILED';
  reviewerName?: string;
  reviewerComment?: string;
  targetNode?: string;
  provisionedVmid?: number;
  upid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceRequestStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export async function fetchResourceRequests(status?: string, requester?: string): Promise<ResourceRequest[]> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (requester) params.append('requester', requester);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/infra/requests${query}`);
  return safeJsonOrFallback<ResourceRequest[]>(res, []);
}

export async function fetchResourceRequestStats(): Promise<ResourceRequestStats> {
  const res = await fetch(`${API_BASE}/api/infra/requests/stats`);
  return safeJsonOrFallback<ResourceRequestStats>(res, { total: 0, pending: 0, approved: 0, rejected: 0 });
}

export async function createResourceRequest(data: {
  title: string;
  requesterName: string;
  department?: string;
  type: 'CREATE_VM' | 'RESIZE_DISK' | 'DELETE_VM';
  reason: string;
  spec?: any;
}): Promise<ResourceRequest> {
  const res = await fetch(`${API_BASE}/api/infra/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return safeJson<ResourceRequest>(res, '자원 신청서 등록에 실패했습니다.');
}

export async function reviewResourceRequest(
  id: string,
  data: {
    status: 'APPROVED' | 'REJECTED';
    reviewerComment?: string;
    targetNode?: string;
  },
  reviewerName: string = '인프라 관리자',
): Promise<ResourceRequest> {
  const res = await fetch(
    `${API_BASE}/api/infra/requests/${id}/review?reviewerName=${encodeURIComponent(reviewerName)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  return safeJson<ResourceRequest>(res, '요청 검토 처리에 실패했습니다.');
}

export type AuthUserRole = 'DEV_TEAM' | 'INFRA_TEAM';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  department: string;
  role: AuthUserRole;
  createdAt?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user: UserProfile;
  token: string;
}

export async function loginUser(data: { email: string; password: string }): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return safeJson<AuthResponse>(res, '로그인에 실패했습니다.');
}

export async function registerUser(data: {
  email: string;
  password: string;
  name: string;
  department: string;
  role: AuthUserRole;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return safeJson<AuthResponse>(res, '회원가입에 실패했습니다.');
}

export async function fetchCurrentUser(token: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await safeJson<{ success: boolean; user: UserProfile }>(res, '사용자 세션 확인에 실패했습니다.');
  return data.user;
}

export async function logoutUser(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

export interface LangGraphNode {
  id: string;
  name: string;
  label: string;
  description: string;
  type: 'start' | 'router' | 'safety' | 'tool' | 'synth' | 'end';
  stateChanges: string[];
}

export interface LangGraphEdge {
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface LangGraphDefinition {
  mermaid: string;
  nodes: LangGraphNode[];
  edges: LangGraphEdge[];
}

export async function fetchLangGraphDefinition(): Promise<LangGraphDefinition> {
  const res = await fetch(`${API_BASE}/api/chat/graph`);
  return safeJson<LangGraphDefinition>(res, 'LangGraph 워크플로우 정보를 불러오지 못했습니다.');
}



