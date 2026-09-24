export function getUnifiedSwaggerDocument() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Proxmox MCP & LangGraph Unified Platform API',
      description: 'Unified L7 Gateway Swagger API Specification for Proxmox Infrastructure Management & AI Agents',
      version: '1.0.0',
      contact: {},
    },
    tags: [
      { name: 'Infrastructure Management', description: 'Proxmox VE Nodes, VMs, Storage, and MCP Tools' },
      { name: 'Resource Requests & Approval', description: 'Developer resource requests and Infra team review/approval workflow' },
      { name: 'Chatbot & Agent', description: 'LangGraph Autonomous AI Agent & Real-time SSE Stream' },
      { name: 'Automation Rules', description: 'Self-healing & automated cluster triggers' },
      { name: 'Audit Logs', description: 'Infrastructure audit trail & AI reasoning history' },
      { name: 'Actuator', description: 'Gateway health and system telemetry' },
    ],
    paths: {
      '/actuator/health': {
        get: {
          tags: ['Actuator'],
          summary: 'Health check endpoint',
          responses: {
            200: { description: 'Gateway and service health status' },
          },
        },
      },
      '/actuator/info': {
        get: {
          tags: ['Actuator'],
          summary: 'Gateway application metadata',
          responses: {
            200: { description: 'Application metadata' },
          },
        },
      },
      '/api/infra/summary': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'Get overall Proxmox cluster summary (telemetry, nodes, VMs)',
          responses: { 200: { description: 'Cluster summary with nodes, VMs, storage, and telemetry' } },
        },
      },
      '/api/infra/nodes': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'List all Proxmox nodes',
          responses: { 200: { description: 'List of online/offline cluster nodes' } },
        },
      },
      '/api/infra/vms': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'List all QEMU VMs and LXC containers',
          parameters: [{ name: 'node', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { 200: { description: 'List of VMs and containers' } },
        },
      },
      '/api/infra/storage': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'List node storages',
          parameters: [{ name: 'node', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { 200: { description: 'List of storage pools' } },
        },
      },
      '/api/infra/tasks': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'List cluster tasks',
          parameters: [{ name: 'node', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { 200: { description: 'List of recent background tasks' } },
        },
      },
      '/api/infra/networks': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'List virtual networks and bridges',
          parameters: [{ name: 'node', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { 200: { description: 'List of network bridges and interfaces' } },
        },
      },
      '/api/infra/topology': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'Get cluster topology tree',
          responses: { 200: { description: 'Topology graph of nodes and hosted instances' } },
        },
      },
      '/api/infra/tools': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'List available MCP tools for remote AI Agent',
          responses: { 200: { description: 'List of 20+ Proxmox MCP tools' } },
        },
      },
      '/api/infra/tools/execute': {
        post: {
          tags: ['Infrastructure Management'],
          summary: 'Remotely execute an MCP tool from AI Agent',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tool: { type: 'string', example: 'qemu_start' },
                    args: { type: 'object', example: { node: 'pve-node-01', vmid: 104 } },
                  },
                  required: ['tool'],
                },
              },
            },
          },
          responses: { 201: { description: 'Tool execution result' } },
        },
      },
      '/api/infra/action': {
        post: {
          tags: ['Infrastructure Management'],
          summary: 'Execute VM power or lifecycle action (Start, Stop, Reboot, Delete)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    node: { type: 'string', example: 'pve-node-01' },
                    vmid: { type: 'number', example: 101 },
                    action: { type: 'string', enum: ['start', 'stop', 'reboot', 'force_stop', 'delete'], example: 'start' },
                    confirm: { type: 'boolean', example: false },
                  },
                  required: ['node', 'vmid', 'action'],
                },
              },
            },
          },
          responses: { 201: { description: 'Action result or confirmation token' } },
        },
      },
      '/api/infra/confirm': {
        post: {
          tags: ['Infrastructure Management'],
          summary: 'Confirm a destructive VM action with token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', example: 'cf_183144bc56374f39' },
                    approved: { type: 'boolean', example: true },
                  },
                  required: ['token', 'approved'],
                },
              },
            },
          },
          responses: { 201: { description: 'Confirmation processing result' } },
        },
      },
      '/api/infra/create': {
        post: {
          tags: ['Infrastructure Management'],
          summary: 'Create a new QEMU VM or LXC container',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    node: { type: 'string', example: 'pve-node-01' },
                    name: { type: 'string', example: 'new-worker-vm' },
                    type: { type: 'string', enum: ['qemu', 'lxc'], example: 'qemu' },
                    cores: { type: 'number', example: 2 },
                    memory: { type: 'number', example: 4096 },
                    disk: { type: 'number', example: 32 },
                  },
                  required: ['node', 'name', 'type'],
                },
              },
            },
          },
          responses: { 201: { description: 'Creation task receipt' } },
        },
      },
      '/api/infra/snapshots': {
        get: {
          tags: ['Infrastructure Management'],
          summary: 'Get snapshots for a VM',
          parameters: [
            { name: 'node', in: 'query', required: true, schema: { type: 'string' }, example: 'pve-node-01' },
            { name: 'vmid', in: 'query', required: true, schema: { type: 'number' }, example: 101 },
          ],
          responses: { 200: { description: 'List of snapshots' } },
        },
      },
      '/api/infra/snapshot': {
        post: {
          tags: ['Infrastructure Management'],
          summary: 'Create a new VM snapshot',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    node: { type: 'string', example: 'pve-node-01' },
                    vmid: { type: 'number', example: 101 },
                    snapname: { type: 'string', example: 'pre-deployment-backup' },
                    description: { type: 'string', example: 'Snapshot before major upgrade' },
                  },
                  required: ['node', 'vmid', 'snapname'],
                },
              },
            },
          },
          responses: { 201: { description: 'Snapshot creation result' } },
        },
      },
      '/api/infra/resize': {
        post: {
          tags: ['Infrastructure Management'],
          summary: 'Resize disk of a VM',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    node: { type: 'string', example: 'pve-node-01' },
                    vmid: { type: 'number', example: 101 },
                    disk: { type: 'string', example: 'scsi0' },
                    size: { type: 'string', example: '+10G' },
                  },
                  required: ['node', 'vmid', 'disk', 'size'],
                },
              },
            },
          },
          responses: { 201: { description: 'Disk resize result' } },
        },
      },
      '/api/infra/requests': {
        get: {
          tags: ['Resource Requests & Approval'],
          summary: 'List resource requests (filter by status or requester)',
          parameters: [
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'PROVISIONED', 'FAILED'] } },
            { name: 'requester', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'List of resource requests' } },
        },
        post: {
          tags: ['Resource Requests & Approval'],
          summary: 'Submit a new developer resource request (VM, Resize, Deletion)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    requesterName: { type: 'string', example: 'dev-alice' },
                    requesterTeam: { type: 'string', example: 'Frontend Web Team' },
                    requestType: { type: 'string', enum: ['CREATE_VM', 'RESIZE_DISK', 'DELETE_VM'], example: 'CREATE_VM' },
                    name: { type: 'string', example: 'web-perf-benchmark' },
                    type: { type: 'string', enum: ['qemu', 'lxc'], example: 'qemu' },
                    cores: { type: 'number', example: 4 },
                    memory: { type: 'number', example: 8192 },
                    disk: { type: 'number', example: 50 },
                    vmid: { type: 'number', example: 105 },
                    reason: { type: 'string', example: 'Performance benchmarking and load testing environment' },
                  },
                  required: ['requesterName', 'requestType', 'reason'],
                },
              },
            },
          },
          responses: { 201: { description: 'Created resource request ticket' } },
        },
      },
      '/api/infra/requests/stats': {
        get: {
          tags: ['Resource Requests & Approval'],
          summary: 'Get resource requests statistics (pending, approved, rejected counts)',
          responses: { 200: { description: 'Resource request queue statistics' } },
        },
      },
      '/api/infra/requests/{id}': {
        get: {
          tags: ['Resource Requests & Approval'],
          summary: 'Get details of a specific resource request',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'REQ-1001' },
          ],
          responses: { 200: { description: 'Resource request details' } },
        },
      },
      '/api/infra/requests/{id}/review': {
        post: {
          tags: ['Resource Requests & Approval'],
          summary: 'Infra team review: Approve (auto-provision) or Reject request',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'REQ-1001' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    decision: { type: 'string', enum: ['APPROVE', 'REJECT'], example: 'APPROVE' },
                    reviewerName: { type: 'string', example: 'infra-admin' },
                    reviewComment: { type: 'string', example: 'Approved for cluster node-01' },
                  },
                  required: ['decision', 'reviewerName'],
                },
              },
            },
          },
          responses: { 200: { description: 'Updated resource request with provisioning results' } },
        },
      },
      '/api/chat/stream': {
        post: {
          tags: ['Chatbot & Agent'],
          summary: 'Send message to LangGraph agent and receive real-time SSE stream',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: '101번 VM 시작해줘' },
                    threadId: { type: 'string', example: 'main-thread' },
                    role: { type: 'string', enum: ['DEV_TEAM', 'INFRA_TEAM'], example: 'DEV_TEAM' },
                    requesterName: { type: 'string', example: 'dev-alice' },
                  },
                  required: ['message'],
                },
              },
            },
          },
          responses: { 201: { description: 'SSE stream (text/event-stream)' } },
        },
      },
      '/api/chat/confirm': {
        post: {
          tags: ['Chatbot & Agent'],
          summary: 'Submit approval or rejection for a safety-gated destructive action',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', example: 'cf_183144bc56374f39' },
                    approved: { type: 'boolean', example: true },
                    threadId: { type: 'string', example: 'main-thread' },
                  },
                  required: ['token', 'approved'],
                },
              },
            },
          },
          responses: { 201: { description: 'Approval response' } },
        },
      },
      '/api/chat/history/{threadId}': {
        get: {
          tags: ['Chatbot & Agent'],
          summary: 'Get conversation history for a specific thread',
          parameters: [{ name: 'threadId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Thread conversation history' } },
        },
      },
      '/api/automation/rules': {
        get: {
          tags: ['Automation Rules'],
          summary: 'Get all automation and auto-heal rules',
          responses: { 200: { description: 'List of active automation rules' } },
        },
        post: {
          tags: ['Automation Rules'],
          summary: 'Create a new automation rule',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'Auto-restart test runner' },
                    condition: { type: 'string', example: 'node:pve-node-01:vm:104:stopped' },
                    action: { type: 'string', example: 'qemu_start' },
                    enabled: { type: 'boolean', example: true },
                  },
                  required: ['name', 'condition', 'action'],
                },
              },
            },
          },
          responses: { 201: { description: 'Created automation rule' } },
        },
      },
      '/api/automation/rules/{id}/toggle': {
        patch: {
          tags: ['Automation Rules'],
          summary: 'Toggle enable/disable status of a rule',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Updated rule' } },
        },
      },
      '/api/automation/rules/{id}': {
        delete: {
          tags: ['Automation Rules'],
          summary: 'Delete an automation rule',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Deletion status' } },
        },
      },
      '/api/audit/logs': {
        get: {
          tags: ['Audit Logs'],
          summary: 'Get recent infrastructure audit and AI action logs',
          parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'number', default: 50 } }],
          responses: { 200: { description: 'Audit log entries' } },
        },
      },
      '/api/audit/decisions': {
        get: {
          tags: ['Audit Logs'],
          summary: 'Get AI agent reasoning and tool decision logs',
          parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'number', default: 50 } }],
          responses: { 200: { description: 'AI decision rationale entries' } },
        },
      },
    },
    components: {
      schemas: {
        VmActionRequestDto: {
          type: 'object',
          properties: {
            node: { type: 'string', example: 'pve-node-01' },
            vmid: { type: 'number', example: 101 },
            action: { type: 'string', enum: ['start', 'stop', 'reboot', 'force_stop', 'delete'], example: 'start' },
            confirm: { type: 'boolean', example: false },
          },
          required: ['node', 'vmid', 'action'],
        },
        ChatMessageInputDto: {
          type: 'object',
          properties: {
            message: { type: 'string', example: '101번 VM 시작해줘' },
            threadId: { type: 'string', example: 'main-thread' },
          },
          required: ['message'],
        },
        ConfirmActionDto: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'cf_183144bc56374f39' },
            approved: { type: 'boolean', example: true },
            threadId: { type: 'string', example: 'main-thread' },
          },
          required: ['token', 'approved'],
        },
      },
    },
  };
}
