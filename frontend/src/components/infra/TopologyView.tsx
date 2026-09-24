'use client';

import { useState } from 'react';
import {
  Server,
  Database,
  Network,
  Cpu,
  HardDrive,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { ClusterTopology, ProxmoxVm } from '@/lib/api';

interface TopologyViewProps {
  topology: ClusterTopology | null;
  onSelectVm: (vm: ProxmoxVm) => void;
}

export function TopologyView({ topology, onSelectVm }: TopologyViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'pve-node-01': true,
    'pve-node-02': true,
  });

  if (!topology) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        토폴로지 데이터를 불러오는 중입니다...
      </div>
    );
  }

  const toggleNode = (nodeName: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeName]: !prev[nodeName] }));
  };

  return (
    <div className="space-y-6">
      {/* Datacenter Root Level Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-100">{topology.datacenter}</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                HA CLUSTER ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Proxmox VE 8.2 고가용성 멀티노드 클러스터 토폴로지 맵
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div>
            총 노드: <strong className="text-slate-200">{topology.nodes.length}대</strong>
          </div>
          <div>
            총 VM/LXC:{' '}
            <strong className="text-slate-200">
              {topology.nodes.reduce((acc, n) => acc + (n.vms?.length || 0), 0)}대
            </strong>
          </div>
        </div>
      </div>

      {/* Nodes Hierarchy Cards */}
      <div className="space-y-4">
        {topology.nodes.map((node) => {
          const isExpanded = expandedNodes[node.node] ?? true;
          const cpuPercent = Math.round((node.cpu || 0) * 100);
          const memPercent = node.maxmem ? Math.round(((node.mem || 0) / node.maxmem) * 100) : 0;
          const runningVms = node.vms?.filter((v) => v.status === 'running').length || 0;

          return (
            <div
              key={node.node}
              className="rounded-xl border border-slate-800/80 bg-slate-900/50 overflow-hidden transition-all duration-200"
            >
              {/* Node Header Row */}
              <div
                onClick={() => toggleNode(node.node)}
                className="p-4 bg-slate-900/80 hover:bg-slate-800/60 cursor-pointer flex items-center justify-between border-b border-slate-800/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-slate-200">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-300" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60 flex items-center justify-center font-mono font-bold text-xs">
                    {node.node.slice(-2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-slate-100 font-mono">{node.node}</h4>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/30 text-emerald-300 border border-emerald-800/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        ONLINE
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      vCPU {node.maxcpu} Cores • RAM {(node.maxmem / 1024 / 1024 / 1024).toFixed(0)} GB • Uptime {Math.floor(node.uptime / 3600)}시간
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">CPU</span>
                    <span className="font-bold text-cyan-400">{cpuPercent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">RAM</span>
                    <span className="font-bold text-emerald-400">{memPercent}%</span>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                    {runningVms} / {node.vms?.length || 0} 가동 중
                  </div>
                </div>
              </div>

              {/* Node Children Tree (Storages, Networks, VMs) */}
              {isExpanded && (
                <div className="p-5 space-y-5 bg-slate-950/40">
                  {/* Attached Sub-resources Overview Chips */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Attached Storage Summary */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-amber-400" />
                          마운트된 스토리지 풀 ({node.storage?.length || 0})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {node.storage?.map((st) => (
                          <div
                            key={st.storage}
                            className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] font-mono flex items-center gap-2 text-slate-300"
                          >
                            <span className="font-medium text-slate-100">{st.storage}</span>
                            <span className="text-slate-500">({st.type})</span>
                            <span className="text-emerald-400">
                              {((st.avail || 0) / 1024 / 1024 / 1024).toFixed(0)}G 여유
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Attached Network Bridges Summary */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <Network className="w-3.5 h-3.5 text-cyan-400" />
                          가상 브릿지 인터페이스 ({node.networks?.length || 0})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {node.networks?.map((net, i) => (
                          <div
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] font-mono flex items-center gap-2 text-slate-300"
                          >
                            <span className="font-medium text-cyan-300">{net.iface}</span>
                            <span className="text-slate-400">{net.cidr}</span>
                            {net.ports && <span className="text-amber-400">[{net.ports}]</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hosted Virtual Instances Grid */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        호스팅 가상머신 (VM) 및 컨테이너 (LXC)
                      </h5>
                      <span className="text-[11px] text-slate-500 font-mono">
                        카드 클릭 시 하드웨어 상세 모니터링 모달 호출
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {node.vms?.map((vm) => {
                        const isVmRunning = vm.status === 'running';
                        const vmRamGB = ((vm.maxmem || 0) / 1024 / 1024 / 1024).toFixed(1);
                        const vmDiskGB = ((vm.maxdisk || 0) / 1024 / 1024 / 1024).toFixed(0);

                        return (
                          <div
                            key={vm.vmid}
                            onClick={() => onSelectVm(vm)}
                            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/60 cursor-pointer transition-all duration-200 group space-y-2.5 shadow-sm"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-emerald-400 text-xs font-bold">
                                    {vm.vmid}
                                  </span>
                                  <span className="font-medium text-slate-100 text-xs truncate max-w-[140px] group-hover:text-emerald-300 transition-colors">
                                    {vm.name}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-mono uppercase">
                                  {vm.type}
                                </span>
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  isVmRunning
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isVmRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                                  }`}
                                />
                                {vm.status.toUpperCase()}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                              <div>
                                <span className="text-[9px] text-slate-500 block">vCPU</span>
                                {vm.cpus || 2} C
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-500 block">RAM</span>
                                {vmRamGB} GB
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-500 block">디스크</span>
                                {vmDiskGB} GB
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
