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

export async function fetchClusterSummary(): Promise<ClusterSummary> {
  const res = await fetch(`${API_BASE}/api/infra/summary`);
  if (!res.ok) throw new Error('Failed to fetch cluster summary');
  return res.json();
}

export async function executeVmAction(
  node: string,
  vmid: number,
  action: 'start' | 'stop' | 'reboot' | 'shutdown' | 'force_stop' | 'delete',
  confirm: boolean = false,
) {
  const res = await fetch(`${API_BASE}/api/infra/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node, vmid, action, confirm }),
  });
  return res.json();
}

export async function fetchAutomationRules(): Promise<AutomationRule[]> {
  const res = await fetch(`${API_BASE}/api/automation/rules`);
  if (!res.ok) throw new Error('Failed to fetch automation rules');
  return res.json();
}

export async function toggleAutomationRule(id: string): Promise<AutomationRule> {
  const res = await fetch(`${API_BASE}/api/automation/rules/${id}/toggle`, {
    method: 'PATCH',
  });
  return res.json();
}

export async function createAutomationRule(data: Partial<AutomationRule>): Promise<AutomationRule> {
  const res = await fetch(`${API_BASE}/api/automation/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteAutomationRule(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/automation/rules/${id}`, { method: 'DELETE' });
}

export async function fetchAuditLogs(limit = 30): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/api/audit/logs?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

export async function fetchDecisionLogs(limit = 50): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/api/audit/decisions?limit=${limit}`);
  if (!res.ok) return [];
  return res.json();
}

export async function confirmAction(token: string, approved: boolean) {
  const res = await fetch(`${API_BASE}/api/chat/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, approved }),
  });
  return res.json();
}

export async function createInstance(data: {
  node: string;
  vmid: number;
  name: string;
  type: 'qemu' | 'lxc';
  cpus: number;
  memory: number;
  diskSize: number;
}) {
  const res = await fetch(`${API_BASE}/api/infra/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchSnapshots(node: string, vmid: number) {
  const res = await fetch(`${API_BASE}/api/infra/snapshots?node=${node}&vmid=${vmid}`);
  if (!res.ok) return [];
  return res.json();
}

export async function createSnapshot(data: {
  node: string;
  vmid: number;
  snapname: string;
  description?: string;
}) {
  const res = await fetch(`${API_BASE}/api/infra/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function resizeVmDisk(node: string, vmid: number, size: string = '+10G') {
  const res = await fetch(`${API_BASE}/api/infra/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node, vmid, disk: 'scsi0', size }),
  });
  return res.json();
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
  if (!res.ok) return [];
  return res.json();
}

export async function fetchTasks(node?: string): Promise<ProxmoxTask[]> {
  const url = node ? `${API_BASE}/api/infra/tasks?node=${node}` : `${API_BASE}/api/infra/tasks`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchTopology(): Promise<ClusterTopology> {
  const res = await fetch(`${API_BASE}/api/infra/topology`);
  if (!res.ok) throw new Error('Failed to fetch cluster topology');
  return res.json();
}

export async function fetchStorage(node?: string): Promise<ProxmoxStorage[]> {
  const url = node ? `${API_BASE}/api/infra/storage?node=${node}` : `${API_BASE}/api/infra/storage`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
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
  if (!res.ok) return [];
  return res.json();
}

export async function fetchResourceRequestStats(): Promise<ResourceRequestStats> {
  const res = await fetch(`${API_BASE}/api/infra/requests/stats`);
  if (!res.ok) return { total: 0, pending: 0, approved: 0, rejected: 0 };
  return res.json();
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
  if (!res.ok) throw new Error('Failed to create resource request');
  return res.json();
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
  if (!res.ok) throw new Error('Failed to review resource request');
  return res.json();
}


